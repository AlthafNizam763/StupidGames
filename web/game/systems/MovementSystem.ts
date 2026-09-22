import { AnimationState, Facing, PLAYER_BASE_SPEED } from '@voidline/shared';
import { clampToBounds, resolveCircleRect, type Circle } from '../collision/resolve';
import type { Entity, InputSnapshot, Rect, World } from '../engine/types';

/**
 * Movement and collision, one fixed step.
 *
 * Runs on the client as *prediction*: the same integration the server performs,
 * so the local player moves the instant a key goes down instead of waiting a
 * round trip. The server remains authoritative and corrects any drift (Phase
 * 11) - this exists to hide latency, not to decide anything.
 *
 * Because both sides run the same maths on the same constants, a well-behaved
 * client almost never needs correcting.
 */

/** Reused across calls. One allocation for the life of the module, not one per tick. */
const scratch: Circle = { x: 0, y: 0, radius: 0 };

/** Broadphase results, reused for the same reason. */
const nearby: Rect[] = [];

export function applyInput(entity: Entity, input: InputSnapshot): void {
  if (!entity.alive) {
    entity.velocity.x = 0;
    entity.velocity.y = 0;
    return;
  }

  // Magnitude lets a joystick walk: a thumb pushed halfway moves at half speed,
  // which a keyboard cannot express but a stick should.
  const speed = PLAYER_BASE_SPEED * Math.min(1, input.magnitude);
  entity.velocity.x = input.direction.x * speed;
  entity.velocity.y = input.direction.y * speed;
}

export function stepEntity(entity: Entity, world: World, dt: number): void {
  // Remember where this tick started so the renderer can interpolate from it.
  entity.previous.x = entity.position.x;
  entity.previous.y = entity.position.y;

  const moving = entity.velocity.x !== 0 || entity.velocity.y !== 0;

  if (moving) {
    entity.position.x += entity.velocity.x * dt;
    entity.position.y += entity.velocity.y * dt;

    scratch.x = entity.position.x;
    scratch.y = entity.position.y;
    scratch.radius = entity.radius;

    /*
     * Only the walls near the entity, via the broadphase. On ORBITAL-09 that
     * is two or three rather than sixty-nine - and the result is identical,
     * because a wall on the far side of the station could not have been hit.
     *
     * Before a map loads there is no grid, so everything present is checked;
     * at that point the world is empty anyway.
     */
    const candidates = world.grid
      ? world.grid.query(scratch.x, scratch.y, scratch.radius, nearby)
      : world.obstacles;

    /*
     * Resolved against every candidate rather than stopping at the first hit.
     * In a corner a single pass would push the entity out of one wall and into
     * the other; iterating settles it in the gap.
     */
    for (const rect of candidates) {
      resolveCircleRect(scratch, rect);
    }
    clampToBounds(scratch, world.bounds);

    entity.position.x = scratch.x;
    entity.position.y = scratch.y;

    // Face the direction of travel, but ignore near-vertical movement so
    // walking straight up or down does not flip the sprite on noise.
    if (Math.abs(entity.velocity.x) > 1) {
      entity.facing = entity.velocity.x < 0 ? Facing.LEFT : Facing.RIGHT;
    }
  }

  const nextAnimation = !entity.alive
    ? AnimationState.DEAD
    : moving
      ? AnimationState.WALK
      : AnimationState.IDLE;

  // Reset the timer on a change so a cycle always starts at its first frame.
  if (nextAnimation !== entity.animation) {
    entity.animation = nextAnimation;
    entity.animationTime = 0;
  } else {
    entity.animationTime += dt;
  }
}
