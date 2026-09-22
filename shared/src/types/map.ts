import type { MapId, ZoneId } from '../constants/map';
import type { TaskType } from './task';
import type { Vec2 } from './common';

/**
 * Map data, as it crosses the wire.
 *
 * The *shape* is part of the contract; the geometry is not. ORBITAL-09 is
 * authored server-side and shipped to the client as one of these (Phase 1
 * decision, recorded in constants/map.ts) - so moving a wall, adding a door or
 * re-placing a terminal is a data change the client picks up automatically,
 * not a protocol change requiring both sides to be redeployed together.
 *
 * It also means the server is the only authority on what the map *is*. A client
 * cannot claim a wall is somewhere else, because it did not author the number.
 */

export interface MapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A named room. Its bounds are the walkable interior, not the wall line. */
export interface MapZone {
  id: ZoneId;
  label: string;
  bounds: MapRect;
}

/**
 * A solid rectangle. Players collide with these and cannot pass.
 *
 * Rectangles rather than polygons: a station is architectural, so everything is
 * axis-aligned anyway, and circle-against-rectangle has a closed-form solution
 * that both sides can compute identically. A polygon solver would be more
 * general and would introduce floating-point disagreement between client
 * prediction and server authority.
 */
export type MapWall = MapRect;

/** Where players are placed at the start of a match, and after a council. */
export interface MapSpawn extends Vec2 {
  zone: ZoneId;
}

/** A fixed point a player interacts with to work an objective. */
export interface MapTerminal {
  id: string;
  type: TaskType;
  zone: ZoneId;
  position: Vec2;
}

/** A station system a sabotage can break and players must repair. */
export interface MapRepairStation {
  id: string;
  zone: ZoneId;
  position: Vec2;
}

export interface MapData {
  id: MapId;
  label: string;
  /** Outer hull. Nothing may leave it. */
  bounds: MapRect;
  zones: MapZone[];
  walls: MapWall[];
  spawns: MapSpawn[];
  terminals: MapTerminal[];
  repairStations: MapRepairStation[];
  /**
   * Bumped whenever the geometry changes.
   *
   * The client caches map data - it is large and static - so it needs
   * something cheap to compare against rather than refetching each match.
   */
  version: number;
}
