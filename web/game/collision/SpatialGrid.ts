import type { Rect } from '../engine/types';

/**
 * Broadphase: a uniform grid over the map's static geometry.
 *
 * ORBITAL-09 has 69 walls. Testing an entity against every one of them, every
 * tick, for every entity, is 69 × 15 × 60 = ~62,000 checks a second to discover
 * that almost all of them are on the other side of the station. With fifteen
 * players on a phone that is real budget spent on nothing.
 *
 * The grid buckets walls by cell once, at load. A query returns only the walls
 * in the cells an entity actually overlaps - typically two or three.
 *
 * A broadphase is an *optimisation*, not a rule: it changes which pairs get
 * tested, never the outcome of testing them. That is why the server is free to
 * use a different one (or none) without the two sides disagreeing about where a
 * player ends up - which would not be true of anything that decided collision
 * itself.
 */

/**
 * Cell size.
 *
 * Around three player diameters. Smaller means more cells to scan per query and
 * more memory; larger means each cell holds more walls and the filtering earns
 * less. A long wall spans many cells and is registered in each, which is the
 * cost of a uniform grid and is worth it here because the geometry is static.
 */
const DEFAULT_CELL_SIZE = 96;

export class SpatialGrid {
  private readonly cells = new Map<number, Rect[]>();
  private readonly cellSize: number;
  private readonly columns: number;
  private readonly rows: number;
  private readonly originX: number;
  private readonly originY: number;

  constructor(
    bounds: { x: number; y: number; width: number; height: number },
    rects: readonly Rect[],
    cellSize = DEFAULT_CELL_SIZE,
  ) {
    this.cellSize = cellSize;
    this.originX = bounds.x;
    this.originY = bounds.y;
    this.columns = Math.max(1, Math.ceil(bounds.width / cellSize) + 1);
    this.rows = Math.max(1, Math.ceil(bounds.height / cellSize) + 1);

    for (const rect of rects) this.insert(rect);
  }

  /**
   * One integer per cell, so the map is keyed by a number rather than a string.
   *
   * Only valid for indices already clamped into range. Unclamped, a negative
   * column makes `row * columns + column` collide with the previous row's last
   * cell - which would return walls from entirely the wrong part of the map.
   * Every caller goes through `clampColumn` / `clampRow` for that reason.
   */
  private key(column: number, row: number): number {
    return row * this.columns + column;
  }

  /**
   * Indices are clamped rather than rejected.
   *
   * Geometry or a query can legitimately sit outside the declared bounds - a
   * hull wall on the boundary, or an entity pushed a fraction past it. Clamping
   * files those into the nearest edge cell, which keeps them findable. The cost
   * is a few extra candidates at the edges; the alternative is dropping a wall
   * and letting a player through it.
   */
  private clampColumn(value: number): number {
    return Math.min(this.columns - 1, Math.max(0, value));
  }

  private clampRow(value: number): number {
    return Math.min(this.rows - 1, Math.max(0, value));
  }

  private columnOf(x: number): number {
    return this.clampColumn(Math.floor((x - this.originX) / this.cellSize));
  }

  private rowOf(y: number): number {
    return this.clampRow(Math.floor((y - this.originY) / this.cellSize));
  }

  private insert(rect: Rect): void {
    const minColumn = this.columnOf(rect.x);
    const maxColumn = this.columnOf(rect.x + rect.width);
    const minRow = this.rowOf(rect.y);
    const maxRow = this.rowOf(rect.y + rect.height);

    for (let row = minRow; row <= maxRow; row++) {
      for (let column = minColumn; column <= maxColumn; column++) {
        const key = this.key(column, row);
        const bucket = this.cells.get(key);
        if (bucket) bucket.push(rect);
        else this.cells.set(key, [rect]);
      }
    }
  }

  /**
   * Rectangles that might overlap the given circle.
   *
   * Results are written into `out` rather than returned in a fresh array: this
   * runs per entity per tick, and allocating an array each time is exactly the
   * kind of garbage that produces a stutter every few seconds.
   *
   * A wall spanning several cells can appear twice. Resolving it twice is
   * harmless - the second pass finds no overlap - and de-duplicating with a Set
   * would cost more than the redundant check.
   */
  query(x: number, y: number, radius: number, out: Rect[]): Rect[] {
    out.length = 0;

    const minColumn = this.columnOf(x - radius);
    const maxColumn = this.columnOf(x + radius);
    const minRow = this.rowOf(y - radius);
    const maxRow = this.rowOf(y + radius);

    for (let row = minRow; row <= maxRow; row++) {
      for (let column = minColumn; column <= maxColumn; column++) {
        const bucket = this.cells.get(this.key(column, row));
        if (!bucket) continue;
        for (const rect of bucket) out.push(rect);
      }
    }

    return out;
  }

  /** Number of occupied cells. Diagnostics only. */
  get cellCount(): number {
    return this.cells.size;
  }
}
