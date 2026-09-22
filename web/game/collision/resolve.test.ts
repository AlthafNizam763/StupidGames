import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clampToBounds, intersects, resolveCircleRect, type Circle } from './resolve';

const WALL = { x: 100, y: 100, width: 200, height: 40 };

function circle(x: number, y: number, radius = 16): Circle {
  return { x, y, radius };
}

describe('circle against rectangle', () => {
  it('detects no overlap when clearly apart', () => {
    assert.equal(intersects(circle(0, 0), WALL), false);
  });

  it('detects overlap when the circle crosses an edge', () => {
    assert.equal(intersects(circle(200, 90), WALL), true);
  });

  it('treats exact touching as no overlap', () => {
    // Resting against a wall must not count as inside it, or a player standing
    // still beside one is pushed away every tick.
    assert.equal(intersects(circle(200, 100 - 16), WALL), false);
  });

  it('detects a circle entirely inside the rectangle', () => {
    assert.equal(intersects(circle(200, 120, 5), WALL), true);
  });
});

describe('resolveCircleRect', () => {
  it('leaves a circle that is not overlapping alone', () => {
    const c = circle(0, 0);
    assert.equal(resolveCircleRect(c, WALL), false);
    assert.deepEqual({ x: c.x, y: c.y }, { x: 0, y: 0 });
  });

  it('pushes a circle out of the top face', () => {
    const c = circle(200, 110);
    assert.equal(resolveCircleRect(c, WALL), true);
    assert.equal(intersects(c, WALL), false);
    // Pushed up, not sideways: the top is the nearest face.
    assert.ok(c.y < 110, `expected to move up, y=${c.y}`);
    assert.equal(c.x, 200, 'should not drift sideways');
  });

  it('pushes a circle out of the left face', () => {
    const c = circle(96, 120);
    resolveCircleRect(c, WALL);
    assert.equal(intersects(c, WALL), false);
    assert.ok(c.x < 96);
  });

  it('resolves a corner overlap diagonally', () => {
    const c = circle(96, 96);
    resolveCircleRect(c, WALL);
    assert.equal(intersects(c, WALL), false);
    // Both axes move, because the nearest point is the corner itself.
    assert.ok(c.x < 96 && c.y < 96, `x=${c.x} y=${c.y}`);
  });

  it('ejects a circle whose centre is exactly on the rectangle', () => {
    // No direction to push along - the degenerate case that would divide by
    // zero. Happens when an entity spawns inside geometry.
    const c = circle(200, 120);
    assert.equal(resolveCircleRect(c, WALL), true);
    assert.equal(intersects(c, WALL), false);
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y), 'must not produce NaN');
  });

  it('ejects through the nearest face when centred inside', () => {
    // Centre is nearer the top edge (20 away) than the sides (100 away).
    const c = circle(200, 115);
    resolveCircleRect(c, WALL);
    assert.ok(c.y < 100, `expected ejection upward, got y=${c.y}`);
  });

  it('settles a circle wedged between two walls', () => {
    const left = { x: 0, y: 0, width: 100, height: 200 };
    const right = { x: 130, y: 0, width: 100, height: 200 };
    const c = circle(115, 100, 20);

    // One pass per wall, as the movement system does. The gap is 30 wide and
    // the circle is 40 across, so it cannot fit - but it must not end up NaN
    // or flung across the map.
    resolveCircleRect(c, left);
    resolveCircleRect(c, right);

    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y));
    assert.ok(c.x > 50 && c.x < 200, `ended up at ${c.x}`);
  });
});

describe('clampToBounds', () => {
  const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 800 };

  it('keeps a circle fully inside, allowing for its radius', () => {
    const c = circle(-50, -50);
    clampToBounds(c, bounds);
    assert.equal(c.x, 16);
    assert.equal(c.y, 16);
  });

  it('clamps against the far edges too', () => {
    const c = circle(5000, 5000);
    clampToBounds(c, bounds);
    assert.equal(c.x, 1000 - 16);
    assert.equal(c.y, 800 - 16);
  });

  it('leaves an interior position untouched', () => {
    const c = circle(500, 400);
    clampToBounds(c, bounds);
    assert.deepEqual({ x: c.x, y: c.y }, { x: 500, y: 400 });
  });
});
