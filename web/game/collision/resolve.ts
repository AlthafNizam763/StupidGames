import type { Rect } from '../engine/types';

/**
 * Circle-against-rectangle collision.
 *
 * Players are circles and walls are rectangles, which keeps resolution to a
 * closed-form calculation rather than a general polygon solver. It also matches
 * how the server will check movement in Phase 11 - both sides have to agree, or
 * every step near a wall produces a correction.
 *
 * Resolution pushes the circle out along the shortest axis. Sliding along a
 * wall therefore falls out naturally: moving diagonally into one clears the
 * perpendicular component and leaves the parallel one intact, instead of
 * stopping the player dead.
 */

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

/** Nearest point to a circle's centre on a rectangle's perimeter or interior. */
function closestPoint(circle: Circle, rect: Rect): { x: number; y: number } {
  return {
    x: Math.min(Math.max(circle.x, rect.x), rect.x + rect.width),
    y: Math.min(Math.max(circle.y, rect.y), rect.y + rect.height),
  };
}

export function intersects(circle: Circle, rect: Rect): boolean {
  const point = closestPoint(circle, rect);
  const dx = circle.x - point.x;
  const dy = circle.y - point.y;
  return dx * dx + dy * dy < circle.radius * circle.radius;
}

/**
 * Pushes a circle out of a rectangle it overlaps.
 *
 * Mutates the circle in place - this runs for every entity against every
 * nearby wall each tick, and returning a new object each time would be pure
 * allocation.
 */
export function resolveCircleRect(circle: Circle, rect: Rect): boolean {
  const point = closestPoint(circle, rect);
  let dx = circle.x - point.x;
  let dy = circle.y - point.y;
  const distanceSq = dx * dx + dy * dy;

  if (distanceSq >= circle.radius * circle.radius) return false;

  if (distanceSq > 0.000001) {
    // Outside the rectangle: push straight out along the shortest route.
    const distance = Math.sqrt(distanceSq);
    const overlap = circle.radius - distance;
    circle.x += (dx / distance) * overlap;
    circle.y += (dy / distance) * overlap;
    return true;
  }

  /*
   * The centre is exactly on the rectangle, so there is no direction to push
   * along. Happens when an entity is spawned inside geometry, or pushed in by
   * two walls at once. Eject through the nearest face instead.
   */
  const left = circle.x - rect.x;
  const right = rect.x + rect.width - circle.x;
  const top = circle.y - rect.y;
  const bottom = rect.y + rect.height - circle.y;
  const minimum = Math.min(left, right, top, bottom);

  dx = 0;
  dy = 0;
  if (minimum === left) dx = -(left + circle.radius);
  else if (minimum === right) dx = right + circle.radius;
  else if (minimum === top) dy = -(top + circle.radius);
  else dy = bottom + circle.radius;

  circle.x += dx;
  circle.y += dy;
  return true;
}

/** Keeps a circle fully inside a rectangular world. */
export function clampToBounds(
  circle: Circle,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): void {
  circle.x = Math.min(Math.max(circle.x, bounds.minX + circle.radius), bounds.maxX - circle.radius);
  circle.y = Math.min(Math.max(circle.y, bounds.minY + circle.radius), bounds.maxY - circle.radius);
}
