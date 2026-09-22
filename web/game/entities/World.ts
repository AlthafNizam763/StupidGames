import {
  AVATAR_COLOURS,
  AnimationState,
  DEFAULT_AVATAR_ID,
  Facing,
  PLAYER_RADIUS,
  isAvatarId,
} from '@voidline/shared';
import type { Entity, World } from '../engine/types';

/**
 * World construction and entity bookkeeping.
 *
 * The world is a plain mutable object. Entities are added and removed here, and
 * mutated in place by the systems - there is no event bus, no reactive layer,
 * nothing that would make a position change cost more than writing a number.
 */

/**
 * A placeholder arena.
 *
 * PHASE 9 SCOPE: a bounded room with a few blocks in it, enough to exercise
 * camera clamping, collision and culling. ORBITAL-09's ten zones and their real
 * geometry arrive in Phase 10, loaded as map data from the server - which is
 * why `obstacles` is just an array of rectangles rather than anything the
 * layout is baked into.
 */
export function createWorld(): World {
  return {
    entities: new Map(),
    localId: null,
    bounds: { minX: 0, minY: 0, maxX: 1600, maxY: 1200 },
    obstacles: [
      { x: 260, y: 220, width: 300, height: 40 },
      { x: 260, y: 220, width: 40, height: 260 },
      { x: 1040, y: 220, width: 300, height: 40 },
      { x: 1300, y: 220, width: 40, height: 260 },
      { x: 700, y: 520, width: 200, height: 160 },
      { x: 260, y: 940, width: 340, height: 40 },
      { x: 1000, y: 940, width: 340, height: 40 },
    ],
  };
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
 * A spawn point clear of the obstacles.
 *
 * Phase 10 replaces this with the map's declared spawn points; until then it
 * picks the centre of the arena, which the placeholder layout keeps clear.
 */
export function defaultSpawn(world: World): { x: number; y: number } {
  return {
    x: (world.bounds.minX + world.bounds.maxX) / 2,
    y: (world.bounds.minY + world.bounds.maxY) / 2 + 260,
  };
}
