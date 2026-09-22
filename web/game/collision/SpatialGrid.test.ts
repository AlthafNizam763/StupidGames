import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Rect } from '../engine/types';
import { intersects } from './resolve';
import { SpatialGrid } from './SpatialGrid';

/**
 * The broadphase.
 *
 * The property that matters is *equivalence*: the grid may return extra
 * candidates, but it must never omit one that could actually be hit. Missing a
 * wall means walking through it, and it would only show up as a player
 * occasionally clipping a corner - the kind of bug that is nearly impossible to
 * reproduce by hand.
 *
 * So the important test is not "the grid returns few results" but "the grid and
 * a brute-force scan resolve to the same collisions".
 */

const BOUNDS = { x: 0, y: 0, width: 2000, height: 1500 };

function walls(): Rect[] {
  const out: Rect[] = [];
  // A lattice, so there is geometry everywhere rather than in one corner.
  for (let x = 100; x < 1900; x += 220) {
    for (let y = 100; y < 1400; y += 190) {
      out.push({ x, y, width: 140, height: 20 });
      out.push({ x, y, width: 20, height: 120 });
    }
  }
  return out;
}

describe('SpatialGrid', () => {
  it('returns candidates near a point', () => {
    const rects: Rect[] = [{ x: 100, y: 100, width: 50, height: 50 }];
    const grid = new SpatialGrid(BOUNDS, rects);

    const out: Rect[] = [];
    grid.query(120, 120, 16, out);
    assert.equal(out.length, 1);
  });

  it('returns nothing where there is nothing', () => {
    const grid = new SpatialGrid(BOUNDS, [{ x: 100, y: 100, width: 50, height: 50 }]);

    const out: Rect[] = [];
    grid.query(1800, 1400, 16, out);
    assert.equal(out.length, 0);
  });

  it('finds a wall that spans many cells', () => {
    // A long corridor wall is registered in every cell it crosses; querying
    // near its far end must still find it.
    const long: Rect = { x: 0, y: 500, width: 1900, height: 16 };
    const grid = new SpatialGrid(BOUNDS, [long]);

    const out: Rect[] = [];
    grid.query(1850, 505, 16, out);
    assert.ok(out.length >= 1, 'missed a wall spanning multiple cells');
  });

  it('finds a wall the query circle only just touches', () => {
    const grid = new SpatialGrid(BOUNDS, [{ x: 200, y: 200, width: 100, height: 100 }]);

    const out: Rect[] = [];
    // Centre is outside the rectangle; the radius reaches it.
    grid.query(180, 250, 25, out);
    assert.ok(out.length >= 1, 'missed a wall within the query radius');
  });

  it('reuses the output array rather than allocating', () => {
    const grid = new SpatialGrid(BOUNDS, walls());
    const out: Rect[] = [];

    const first = grid.query(300, 300, 16, out);
    const second = grid.query(900, 900, 16, out);

    // Same array object both times: this runs per entity per tick, and a fresh
    // array each time is the sort of garbage that produces a periodic stutter.
    assert.equal(first, out);
    assert.equal(second, out);
  });

  it('clears previous results between queries', () => {
    const grid = new SpatialGrid(BOUNDS, walls());
    const out: Rect[] = [];

    grid.query(300, 300, 16, out);
    grid.query(1850, 1450, 16, out);

    // Stale entries would resolve the player against walls nowhere near them.
    for (const rect of out) {
      const near = Math.abs(rect.x - 1850) < 300 && Math.abs(rect.y - 1450) < 300;
      assert.ok(near, `stale candidate left in the output: ${JSON.stringify(rect)}`);
    }
  });

  it('never misses a wall a brute-force scan would find', () => {
    const rects = walls();
    const grid = new SpatialGrid(BOUNDS, rects);
    const out: Rect[] = [];
    const radius = 16;

    let checked = 0;
    let candidateTotal = 0;

    // Sweep the whole map. Anything the grid omits here is a wall a player
    // would walk straight through at that position.
    for (let x = 0; x <= BOUNDS.width; x += 17) {
      for (let y = 0; y <= BOUNDS.height; y += 19) {
        const bruteForce = rects.filter((rect) => intersects({ x, y, radius }, rect));
        grid.query(x, y, radius, out);
        candidateTotal += out.length;
        checked += 1;

        for (const hit of bruteForce) {
          assert.ok(
            out.includes(hit),
            `grid missed a wall at (${x},${y}): ${JSON.stringify(hit)}`,
          );
        }
      }
    }

    // And it is actually doing its job: the average candidate count should be
    // a small fraction of the full set, or the grid is pure overhead.
    const average = candidateTotal / checked;
    assert.ok(
      average < rects.length / 10,
      `broadphase returned ${average.toFixed(1)} of ${rects.length} walls on average`,
    );
  });

  it('handles geometry outside the declared bounds', () => {
    // Indices are clamped into range. Unclamped, a negative column makes the
    // key collide with the previous row's last cell and returns walls from a
    // completely different part of the map.
    const grid = new SpatialGrid(BOUNDS, [{ x: -300, y: -300, width: 100, height: 100 }]);

    const out: Rect[] = [];
    grid.query(-250, -250, 16, out);
    assert.equal(out.length, 1, 'an off-map wall should still be findable');

    grid.query(500, 500, 16, out);
    assert.equal(out.length, 0, 'an off-map wall leaked into a distant cell');
  });

  it('does not let a negative index alias a valid cell', () => {
    /*
     * The specific collision: with C columns, key(-1, row) equals
     * key(C-1, row-1). A wall in the last column of one row would be returned
     * for a query just off the left edge of the next.
     */
    const marker: Rect = { x: BOUNDS.width - 50, y: 300, width: 40, height: 40 };
    const grid = new SpatialGrid(BOUNDS, [marker]);

    const out: Rect[] = [];
    // Just off the left edge, one row below the marker.
    grid.query(-10, 300 + 96, 16, out);
    assert.equal(out.length, 0, 'a right-edge wall aliased into a left-edge query');
  });

  it('copes with an empty map', () => {
    const grid = new SpatialGrid(BOUNDS, []);
    const out: Rect[] = [];
    assert.doesNotThrow(() => grid.query(100, 100, 16, out));
    assert.equal(out.length, 0);
    assert.equal(grid.cellCount, 0);
  });
});
