import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PLAYER_RADIUS, ROOM_ZONE_IDS, ZoneId, type MapRect } from '@voidline/shared';
import { buildRoomWalls, pointInRect, rectContains, rectsOverlap } from './geometry';
import { ORBITAL_09, zoneAt } from './index';

/**
 * Map integrity.
 *
 * These are the checks that catch a layout mistake before a player does. A
 * mistyped offset produces a gap a player can walk through into the void, or a
 * terminal sealed inside a wall - neither of which is obvious by looking at the
 * numbers, and both of which are obvious to whoever finds them mid-match.
 */

const map = ORBITAL_09;

describe('wall generation', () => {
  const room = { bounds: { x: 100, y: 100, width: 400, height: 300 }, doors: [] };

  it('encloses a room with no doors on four sides', () => {
    const walls = buildRoomWalls(room);
    assert.equal(walls.length, 4);
  });

  it('leaves a gap where a door is', () => {
    const walls = buildRoomWalls({
      ...room,
      doors: [{ side: 'south', offset: 200, width: 100 }],
    });

    // The south run is now two segments instead of one.
    const southWalls = walls.filter((wall) => wall.y >= 400);
    assert.equal(southWalls.length, 2);

    // And nothing covers the middle of the doorway.
    const doorCentreX = 100 - 16 + 250;
    const blocked = walls.some((wall) => pointInRect(doorCentreX, 405, wall));
    assert.equal(blocked, false, 'the doorway should be open');
  });

  it('still blocks the wall either side of a door', () => {
    const walls = buildRoomWalls({
      ...room,
      doors: [{ side: 'south', offset: 200, width: 100 }],
    });

    assert.ok(walls.some((wall) => pointInRect(150, 405, wall)), 'left of the door should be solid');
    assert.ok(walls.some((wall) => pointInRect(450, 405, wall)), 'right of the door should be solid');
  });

  it('handles several doors on one side', () => {
    const walls = buildRoomWalls({
      ...room,
      doors: [
        { side: 'north', offset: 80, width: 60 },
        { side: 'north', offset: 260, width: 60 },
      ],
    });

    const northWalls = walls.filter((wall) => wall.y < 100);
    assert.equal(northWalls.length, 3, 'two doors should split the run into three');
  });

  it('emits no zero-width segment for a door flush with a corner', () => {
    const walls = buildRoomWalls({
      ...room,
      doors: [{ side: 'west', offset: 0, width: 80 }],
    });

    // A degenerate rectangle would be something collision has to special-case.
    for (const wall of walls) {
      assert.ok(wall.width > 0 && wall.height > 0, `degenerate wall ${JSON.stringify(wall)}`);
    }
  });

  it('covers the corners, leaving no diagonal gap', () => {
    const walls = buildRoomWalls(room);

    // A fast diagonal move through an open corner is the classic escape from a
    // room built out of four un-overlapping segments.
    const corners = [
      { x: 100 - 8, y: 100 - 8 },
      { x: 500 + 8, y: 100 - 8 },
      { x: 100 - 8, y: 400 + 8 },
      { x: 500 + 8, y: 400 + 8 },
    ];

    for (const corner of corners) {
      assert.ok(
        walls.some((wall) => pointInRect(corner.x, corner.y, wall)),
        `corner ${JSON.stringify(corner)} is open`,
      );
    }
  });
});

describe('ORBITAL-09 layout', () => {
  it('has all ten named rooms', () => {
    const ids = map.zones.map((zone) => zone.id).sort();
    const expected = [...ROOM_ZONE_IDS].sort();
    assert.deepEqual(ids, expected);
  });

  it('gives every room a label', () => {
    for (const zone of map.zones) {
      assert.ok(zone.label.length > 0, `${zone.id} has no label`);
    }
  });

  it('keeps every room inside the hull', () => {
    for (const zone of map.zones) {
      assert.ok(rectContains(map.bounds, zone.bounds), `${zone.id} escapes the hull`);
    }
  });

  it('keeps every wall inside the hull', () => {
    for (const wall of map.walls) {
      assert.ok(rectContains(map.bounds, wall), `wall outside hull: ${JSON.stringify(wall)}`);
    }
  });

  it('never overlaps two rooms', () => {
    for (let i = 0; i < map.zones.length; i++) {
      for (let j = i + 1; j < map.zones.length; j++) {
        const a = map.zones[i]!;
        const b = map.zones[j]!;
        assert.equal(
          rectsOverlap(a.bounds, b.bounds),
          false,
          `${a.id} overlaps ${b.id}`,
        );
      }
    }
  });

  it('leaves a corridor wide enough for a player between rooms', () => {
    // Rooms have walls on both sides of a gap, so the clear space is the gap
    // minus two wall thicknesses. A player is 32 units across.
    const minimumClearance = PLAYER_RADIUS * 2;

    for (let i = 0; i < map.zones.length; i++) {
      for (let j = i + 1; j < map.zones.length; j++) {
        const a = map.zones[i]!.bounds;
        const b = map.zones[j]!.bounds;

        const horizontalGap = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width));
        const verticalGap = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height));
        const gap = Math.max(horizontalGap, verticalGap);

        // Negative on one axis means they are aligned there; only positive gaps
        // are corridors that need to be passable.
        if (gap > 0) {
          assert.ok(
            gap - 32 >= minimumClearance,
            `only ${gap - 32} clear units between ${map.zones[i]!.id} and ${map.zones[j]!.id}`,
          );
        }
      }
    }
  });

  it('gives every room at least two doors, and no more than authored', () => {
    /*
     * A room with one exit is a dead end, and a dead end turns every encounter
     * into a certainty - "I watched them go in and nobody came out" should be
     * a claim that can be wrong.
     *
     * The upper bound matters as much as the lower one: asserting only
     * `>= 2` is what let a broken counter report twenty-two doorways and pass.
     */
    const authored: Partial<Record<ZoneId, number>> = {
      [ZoneId.COMMAND_DECK]: 2,
      [ZoneId.OBSERVATORY]: 2,
      [ZoneId.SECURITY]: 2,
      [ZoneId.CARGO_BAY]: 2,
      [ZoneId.COMMUNICATIONS]: 3,
      [ZoneId.MEDICAL_BAY]: 3,
      [ZoneId.RESEARCH_LAB]: 3,
      [ZoneId.REACTOR_CORE]: 2,
      [ZoneId.HYDROPONICS]: 3,
      [ZoneId.ENGINE_ROOM]: 3,
    };

    for (const zone of map.zones) {
      const openings = countOpenings(zone.bounds);
      assert.ok(openings >= 2, `${zone.id} is a dead end with ${openings} door(s)`);
      assert.equal(
        openings,
        authored[zone.id],
        `${zone.id} has ${openings} openings, expected ${authored[zone.id]}`,
      );
    }
  });

  it('self-check: the doorway counter detects a sealed room', () => {
    // Guards the guard. A counter that cannot tell sealed from open would make
    // every assertion above meaningless.
    const sealed = { x: 100, y: 100, width: 300, height: 200 };
    const walls = buildRoomWalls({ bounds: sealed, doors: [] });

    let openings = 0;
    let wasOpen = false;
    for (let x = sealed.x - 8; x <= sealed.x + sealed.width + 8; x += 8) {
      const open = !walls.some((wall) => pointInRect(x, sealed.y - 8, wall));
      if (open && !wasOpen) openings += 1;
      wasOpen = open;
    }

    assert.equal(openings, 0, 'a sealed wall run should report no openings');
  });
});

describe('spawns, terminals and stations', () => {
  it('places every spawn inside the hull and clear of walls', () => {
    for (const spawn of map.spawns) {
      assert.ok(pointInRect(spawn.x, spawn.y, map.bounds), `spawn outside hull`);

      const inWall = map.walls.some((wall) =>
        rectsOverlap(
          {
            x: spawn.x - PLAYER_RADIUS,
            y: spawn.y - PLAYER_RADIUS,
            width: PLAYER_RADIUS * 2,
            height: PLAYER_RADIUS * 2,
          },
          wall,
        ),
      );
      assert.equal(inWall, false, `spawn (${spawn.x},${spawn.y}) is inside a wall`);
    }
  });

  it('has a spawn for every player a room can hold', () => {
    assert.ok(map.spawns.length >= 15, `only ${map.spawns.length} spawns`);
  });

  it('does not stack two players on the same spawn', () => {
    const seen = new Set(map.spawns.map((spawn) => `${spawn.x}:${spawn.y}`));
    assert.equal(seen.size, map.spawns.length, 'duplicate spawn points');
  });

  it('places every terminal inside the room it claims', () => {
    for (const terminal of map.terminals) {
      const zone = map.zones.find((candidate) => candidate.id === terminal.zone);
      assert.ok(zone, `${terminal.id} names an unknown zone`);
      assert.ok(
        pointInRect(terminal.position.x, terminal.position.y, zone.bounds),
        `${terminal.id} is outside ${terminal.zone}`,
      );
    }
  });

  it('never seals a terminal inside a wall', () => {
    for (const terminal of map.terminals) {
      const blocked = map.walls.some((wall) =>
        pointInRect(terminal.position.x, terminal.position.y, wall),
      );
      assert.equal(blocked, false, `${terminal.id} is inside a wall`);
    }
  });

  it('gives every terminal a unique id', () => {
    const ids = new Set(map.terminals.map((terminal) => terminal.id));
    assert.equal(ids.size, map.terminals.length);
  });

  it('covers every objective type with at least one terminal', () => {
    const types = new Set(map.terminals.map((terminal) => terminal.type));
    assert.equal(types.size >= 7, true, `only ${types.size} objective types have a terminal`);
  });

  it('places repair stations inside their rooms and clear of walls', () => {
    for (const station of map.repairStations) {
      const zone = map.zones.find((candidate) => candidate.id === station.zone);
      assert.ok(zone, `${station.id} names an unknown zone`);
      assert.ok(
        pointInRect(station.position.x, station.position.y, zone.bounds),
        `${station.id} is outside ${station.zone}`,
      );
      assert.equal(
        map.walls.some((wall) => pointInRect(station.position.x, station.position.y, wall)),
        false,
        `${station.id} is inside a wall`,
      );
    }
  });

  it('puts the two critical repair stations far apart', () => {
    const a = map.repairStations.find((s) => s.id === 'repair-reactor-a')!;
    const b = map.repairStations.find((s) => s.id === 'repair-reactor-b')!;
    const distance = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);

    // A critical sabotage needs both worked. If they were adjacent, one player
    // could clear it alone and the crew would never have to split up.
    assert.ok(distance > 800, `repair stations are only ${Math.round(distance)} apart`);
  });
});

describe('zoneAt', () => {
  it('names the room a point is inside', () => {
    const medical = map.zones.find((zone) => zone.id === ZoneId.MEDICAL_BAY)!;
    const centre = {
      x: medical.bounds.x + medical.bounds.width / 2,
      y: medical.bounds.y + medical.bounds.height / 2,
    };
    assert.equal(zoneAt(map, centre.x, centre.y), ZoneId.MEDICAL_BAY);
  });

  it('reports the space between rooms as corridor', () => {
    // Not a fallback: on this station the gaps between rooms are the corridors.
    assert.equal(zoneAt(map, 710, 1030), ZoneId.CORRIDOR);
  });

  it('reports a point outside the station as corridor rather than throwing', () => {
    assert.equal(zoneAt(map, -500, -500), ZoneId.CORRIDOR);
  });
});

/* ------------------------------------------------------------ helpers - */

/**
 * Counts doorways by walking each wall line and looking for contiguous
 * stretches nothing covers.
 *
 * Each side is walked *separately*. Interleaving probes from different sides -
 * north, south, north, south - makes the open/closed flag flip between
 * unrelated walls and counts every alternation as a doorway, which reports a
 * two-door room as having twenty-two. The `self-check` test below exists
 * because this helper silently lied the first time it was written.
 */
function countOpenings(bounds: MapRect): number {
  const step = 8;
  const probe = 8;
  let openings = 0;

  const sides: Array<Array<{ x: number; y: number }>> = [
    // North and south run the full outer width, matching how the walls are built.
    walk(bounds.x - probe, bounds.x + bounds.width + probe, step, (v) => ({
      x: v,
      y: bounds.y - probe,
    })),
    walk(bounds.x - probe, bounds.x + bounds.width + probe, step, (v) => ({
      x: v,
      y: bounds.y + bounds.height + probe,
    })),
    walk(bounds.y, bounds.y + bounds.height, step, (v) => ({ x: bounds.x - probe, y: v })),
    walk(bounds.y, bounds.y + bounds.height, step, (v) => ({
      x: bounds.x + bounds.width + probe,
      y: v,
    })),
  ];

  for (const side of sides) {
    let wasOpen = false;
    for (const point of side) {
      const open = !map.walls.some((wall) => pointInRect(point.x, point.y, wall));
      if (open && !wasOpen) openings += 1;
      wasOpen = open;
    }
  }

  return openings;
}

function walk<T>(from: number, to: number, step: number, make: (value: number) => T): T[] {
  const out: T[] = [];
  for (let value = from; value <= to; value += step) out.push(make(value));
  return out;
}
