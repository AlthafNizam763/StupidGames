import {
  AVATAR_COLOURS,
  AnimationState,
  DEFAULT_AVATAR_ID,
  Facing,
  PLAYER_RADIUS,
  ZoneId,
  isAvatarId,
  type MapData,
} from '@voidline/shared';
import { SpatialGrid } from '../collision/SpatialGrid';
import type { Entity, World } from '../engine/types';

/**
 * World construction and entity bookkeeping.
 *
 * The world is a plain mutable object. Entities are added and removed here, and
 * mutated in place by the systems - there is no event bus and no reactive
 * layer, so a position change costs exactly one number written.
 */

/**
 * An empty world.
 *
 * Deliberately usable before a map arrives: the engine starts immediately and
 * the map is loaded into it when the request returns. Blocking the loop on a
 * network round trip would mean a black screen on a slow connection.
 */
export function createWorld(): World {
  return {
    entities: new Map(),
    localId: null,
    bounds: { minX: 0, minY: 0, maxX: 1600, maxY: 1200 },
    obstacles: [],
    zones: [],
    grid: null,
    map: null,
  };
}

/**
 * Loads server-authored map data into a world.
 *
 * The geometry is taken as given. The client does not author, adjust or
 * second-guess it - the server is the only authority on where a wall is, which
 * is what lets both sides resolve collision to the same answer (Phase 11).
 */
export function loadMap(world: World, map: MapData): void {
  world.map = map;
  world.bounds = {
    minX: map.bounds.x,
    minY: map.bounds.y,
    maxX: map.bounds.x + map.bounds.width,
    maxY: map.bounds.y + map.bounds.height,
  };
  world.obstacles = map.walls.map((wall) => ({ ...wall }));
  world.zones = map.zones;

  // Built once. The geometry is static for the life of the match, so there is
  // nothing to rebuild per tick.
  world.grid = new SpatialGrid(map.bounds, world.obstacles);
}

export interface SpawnOptions {
  id: string;
  username: string;
  avatarId: string;
  x: number;
  y: number;
  isLocal?: boolean;
  alive?: boolean;
}

export function spawnEntity(world: World, options: SpawnOptions): Entity {
  const colour = isAvatarId(options.avatarId)
    ? AVATAR_COLOURS[options.avatarId]
    : AVATAR_COLOURS[DEFAULT_AVATAR_ID];

  const entity: Entity = {
    id: options.id,
    position: { x: options.x, y: options.y },
    velocity: { x: 0, y: 0 },
    // Render and previous start at the spawn point, so the first frame does
    // not interpolate in from the origin.
    render: { x: options.x, y: options.y },
    previous: { x: options.x, y: options.y },
    radius: PLAYER_RADIUS,
    facing: Facing.RIGHT,
    animation: AnimationState.IDLE,
    animationTime: 0,
    alive: options.alive ?? true,
    colour,
    username: options.username,
    isLocal: options.isLocal ?? false,
  };

  world.entities.set(entity.id, entity);
  if (entity.isLocal) world.localId = entity.id;

  return entity;
}

export function removeEntity(world: World, id: string): void {
  world.entities.delete(id);
  if (world.localId === id) world.localId = null;
}

export function getLocalEntity(world: World): Entity | null {
  return world.localId ? (world.entities.get(world.localId) ?? null) : null;
}

/**
 * A spawn point for the nth player.
 *
 * Uses the map's declared spawns, which are spread along the central corridor
 * so a match does not begin with two players already alone together (see
 * orbital09.ts). Falls back to the centre of the world before a map loads.
 */
export function spawnPointFor(world: World, index: number): { x: number; y: number } {
  const spawns = world.map?.spawns;

  if (spawns && spawns.length > 0) {
    const spawn = spawns[index % spawns.length]!;
    return { x: spawn.x, y: spawn.y };
  }

  return {
    x: (world.bounds.minX + world.bounds.maxX) / 2,
    y: (world.bounds.minY + world.bounds.maxY) / 2,
  };
}

/**
 * Which room a point is in.
 *
 * The client's copy of the server's `zoneAt`, reading the same shipped
 * geometry, used for the HUD. The server computes the authoritative value that
 * other players are told about - this one only decides what its own player
 * sees written on their screen.
 */
export function zoneAt(world: World, x: number, y: number): ZoneId {
  for (const zone of world.zones) {
    if (
      x >= zone.bounds.x &&
      x <= zone.bounds.x + zone.bounds.width &&
      y >= zone.bounds.y &&
      y <= zone.bounds.y + zone.bounds.height
    ) {
      return zone.id;
    }
  }
  return ZoneId.CORRIDOR;
}
