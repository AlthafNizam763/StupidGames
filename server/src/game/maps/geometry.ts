import type { MapRect, MapWall } from '@voidline/shared';

/**
 * Wall generation.
 *
 * A room is authored as an interior rectangle plus a list of doorways. The
 * walls are *derived* from that, rather than typed out as individual
 * rectangles.
 *
 * The reason is not brevity. Hand-authoring four wall segments per room, split
 * around every door, is around 120 rectangles for ORBITAL-09 - each with four
 * numbers that have to agree with its neighbours. Moving one room by 20 units
 * means editing a dozen of them and getting every one right. Deriving them
 * means the layout is described once, in terms a person can check ("Medical Bay
 * is here and has a door on its south wall"), and the arithmetic is done by
 * something that does not make arithmetic mistakes.
 *
 * It is also testable: that every room is enclosed, that a door is genuinely a
 * gap, and that no wall strays outside the hull.
 */

export type Side = 'north' | 'south' | 'east' | 'west';

export interface DoorSpec {
  side: Side;
  /**
   * Distance from the wall's start - left to right on a horizontal wall, top to
   * bottom on a vertical one.
   */
  offset: number;
  width: number;
}

export interface RoomSpec {
  bounds: MapRect;
  doors: DoorSpec[];
}

/** Wall thickness. Thick enough to read as architecture at gameplay zoom. */
export const WALL_THICKNESS = 16;

/**
 * Splits one wall run into segments, leaving a gap at each door.
 *
 * `start`/`end` are along the wall's own axis; `fixed` is its position on the
 * other axis. Returning segments rather than mutating a list keeps this a pure
 * function, which is what makes it straightforward to test.
 */
function segmentsAlong(
  doors: DoorSpec[],
  side: Side,
  start: number,
  end: number,
  fixed: number,
  thickness: number,
  horizontal: boolean,
): MapWall[] {
  const openings = doors
    .filter((door) => door.side === side)
    .map((door) => ({ from: start + door.offset, to: start + door.offset + door.width }))
    // Sorted so the walk below can move left to right in one pass.
    .sort((a, b) => a.from - b.from);

  const walls: MapWall[] = [];
  let cursor = start;

  for (const opening of openings) {
    // A door flush with the corner produces a zero-length segment; skip it
    // rather than emitting a degenerate rectangle that collision would have to
    // special-case.
    if (opening.from > cursor) {
      walls.push(
        horizontal
          ? { x: cursor, y: fixed, width: opening.from - cursor, height: thickness }
          : { x: fixed, y: cursor, width: thickness, height: opening.from - cursor },
      );
    }
    cursor = Math.max(cursor, opening.to);
  }

  if (cursor < end) {
    walls.push(
      horizontal
        ? { x: cursor, y: fixed, width: end - cursor, height: thickness }
        : { x: fixed, y: cursor, width: thickness, height: end - cursor },
    );
  }

  return walls;
}

/**
 * Builds the four walls of a room, with gaps where its doors are.
 *
 * Walls sit *outside* the interior bounds, so `bounds` stays the space a player
 * can actually stand in. Corners are covered by extending the horizontal runs
 * over the full outer width, which avoids a one-pixel diagonal gap at each
 * corner that a fast-moving player could squeeze through.
 */
export function buildRoomWalls(room: RoomSpec, thickness = WALL_THICKNESS): MapWall[] {
  const { x, y, width, height } = room.bounds;

  const outerLeft = x - thickness;
  const outerTop = y - thickness;
  const outerRight = x + width;
  const outerBottom = y + height;
  const outerWidth = width + thickness * 2;

  return [
    // North and south run the full outer width, closing both corners.
    ...segmentsAlong(room.doors, 'north', outerLeft, outerLeft + outerWidth, outerTop, thickness, true),
    ...segmentsAlong(room.doors, 'south', outerLeft, outerLeft + outerWidth, outerBottom, thickness, true),
    // East and west span only the interior height, since the corners are
    // already covered above.
    ...segmentsAlong(room.doors, 'west', y, y + height, outerLeft, thickness, false),
    ...segmentsAlong(room.doors, 'east', y, y + height, outerRight, thickness, false),
  ];
}

/**
 * The hull: four walls around the whole station, drawn inward.
 *
 * World bounds already stop a player leaving, but a visible hull is what makes
 * the station read as enclosed rather than as rooms floating in a void.
 */
export function buildHullWalls(bounds: MapRect, thickness = WALL_THICKNESS): MapWall[] {
  const { x, y, width, height } = bounds;
  return [
    { x, y, width, height: thickness },
    { x, y: y + height - thickness, width, height: thickness },
    { x, y: y + thickness, width: thickness, height: height - thickness * 2 },
    { x: x + width - thickness, y: y + thickness, width: thickness, height: height - thickness * 2 },
  ];
}

/** True when two rectangles overlap by more than a rounding error. */
export function rectsOverlap(a: MapRect, b: MapRect, epsilon = 0.001): boolean {
  return (
    a.x + a.width > b.x + epsilon &&
    b.x + b.width > a.x + epsilon &&
    a.y + a.height > b.y + epsilon &&
    b.y + b.height > a.y + epsilon
  );
}

export function rectContains(outer: MapRect, inner: MapRect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function pointInRect(x: number, y: number, rect: MapRect): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}
