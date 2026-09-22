import { DEFAULT_AVATAR_ID, TaskType, ZoneId, type MapData } from '@voidline/shared';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createWorld, loadMap, spawnEntity } from '../entities/World';
import { nearestTo, type ProximityQuery } from './proximity';

/**
 * HUD proximity (§41).
 *
 * The rule under test is as much about what this does *not* do. It answers
 * "what is nearby" from public world state only, and knows nothing about roles,
 * cooldowns or task assignment - so a HUD built on it can offer an action the
 * server then refuses, and that is correct. The server decides.
 */

const map = {
  id: 'ORBITAL_09',
  label: 'Orbital 09',
  bounds: { x: 0, y: 0, width: 1000, height: 1000 },
  zones: [],
  walls: [],
  spawns: [{ x: 0, y: 0, zone: ZoneId.COMMAND_DECK }],
  terminals: [
    { id: 'near', type: TaskType.REACTOR_CALIBRATION, zone: ZoneId.COMMAND_DECK, position: { x: 30, y: 0 } },
    { id: 'far', type: TaskType.REACTOR_CALIBRATION, zone: ZoneId.COMMAND_DECK, position: { x: 400, y: 0 } },
  ],
  repairStations: [{ id: 'station', zone: ZoneId.COMMAND_DECK, position: { x: 40, y: 0 } }],
  version: 1,
} as unknown as MapData;

function worldWithLocalAtOrigin() {
  const world = createWorld();
  loadMap(world, map);
  spawnEntity(world, {
    id: 'me',
    username: 'me',
    avatarId: DEFAULT_AVATAR_ID,
    x: 0,
    y: 0,
    isLocal: true,
  });
  world.localId = 'me';
  return world;
}

const query = (overrides: Partial<ProximityQuery> = {}): ProximityQuery => ({
  players: true,
  bodies: true,
  terminals: true,
  repairStations: true,
  within: 60,
  ...overrides,
});

describe('nearestTo', () => {
  it('returns nothing when there is no local player', () => {
    const world = createWorld();
    loadMap(world, map);

    const result = nearestTo(world, query());
    assert.deepEqual(result, { player: null, body: null, terminal: null, repairStation: null });
  });

  it('finds the closest terminal within range and ignores the one outside it', () => {
    const world = worldWithLocalAtOrigin();
    const result = nearestTo(world, query());

    assert.equal(result.terminal?.id, 'near');
    assert.equal(result.terminal?.distance, 30);
    assert.equal(result.repairStation?.id, 'station');
  });

  it('searches only the kinds it was asked for', () => {
    const world = worldWithLocalAtOrigin();
    const result = nearestTo(world, query({ terminals: false, repairStations: false }));

    assert.equal(result.terminal, null);
    assert.equal(result.repairStation, null);
  });

  it('respects the radius', () => {
    const world = worldWithLocalAtOrigin();
    // The nearest terminal is 30 away; a 20-unit reach must not find it.
    assert.equal(nearestTo(world, query({ within: 20 })).terminal, null);
  });

  it('never returns the local player, and never a dead one', () => {
    const world = worldWithLocalAtOrigin();

    spawnEntity(world, {
      id: 'corpse',
      username: 'corpse',
      avatarId: DEFAULT_AVATAR_ID,
      x: 5,
      y: 0,
      isLocal: false,
      alive: false,
    });

    // Only the local player and a dead one are in range.
    assert.equal(nearestTo(world, query()).player, null);

    spawnEntity(world, {
      id: 'living',
      username: 'living',
      avatarId: DEFAULT_AVATAR_ID,
      x: 20,
      y: 0,
      isLocal: false,
    });

    assert.equal(nearestTo(world, query()).player?.id, 'living');
  });

  it('picks the closest of several candidates', () => {
    const world = worldWithLocalAtOrigin();

    for (const [id, x] of [
      ['far', 50],
      ['closest', 10],
      ['middle', 25],
    ] as const) {
      spawnEntity(world, {
        id,
        username: id,
        avatarId: DEFAULT_AVATAR_ID,
        x,
        y: 0,
        isLocal: false,
      });
    }

    const result = nearestTo(world, query());
    assert.equal(result.player?.id, 'closest');
    assert.equal(result.player?.distance, 10);
  });

  it('skips a body that has already been reported', () => {
    const world = worldWithLocalAtOrigin();

    world.bodies = [
      {
        id: 'reported',
        playerId: 'x',
        position: { x: 5, y: 0 },
        zone: ZoneId.COMMAND_DECK,
        reported: true,
      },
      {
        id: 'fresh',
        playerId: 'y',
        position: { x: 25, y: 0 },
        zone: ZoneId.COMMAND_DECK,
        reported: false,
      },
    ];

    /*
     * Offering a report on a body whose council has already happened produces
     * a refusal the player cannot act on - a button that does nothing, with no
     * explanation on screen.
     */
    assert.equal(nearestTo(world, query()).body?.id, 'fresh');
  });

  it('carries no role information, because it is not given any', () => {
    const world = worldWithLocalAtOrigin();
    spawnEntity(world, {
      id: 'other',
      username: 'other',
      avatarId: DEFAULT_AVATAR_ID,
      x: 10,
      y: 0,
      isLocal: false,
    });

    const serialised = JSON.stringify(nearestTo(world, query()));
    assert.equal(serialised.includes('SABOTEUR'), false);
    assert.equal(serialised.includes('OPERATOR'), false);
    assert.equal(serialised.includes('role'), false);
  });
});
