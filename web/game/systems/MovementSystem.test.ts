import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AnimationState, Facing, PLAYER_BASE_SPEED } from '@voidline/shared';
import { createWorld, spawnEntity } from '../entities/World';
import type { InputSnapshot, World } from '../engine/types';
import { applyInput, stepEntity } from './MovementSystem';

const STEP = 1 / 60;

function input(x: number, y: number, magnitude = 1): InputSnapshot {
  return { direction: { x, y }, magnitude, interact: false, action: false };
}

/** An empty arena, so tests measure movement rather than collision. */
function openWorld(): World {
  const world = createWorld();
  world.obstacles = [];
  return world;
}

function player(world: World, x = 400, y = 400) {
  return spawnEntity(world, {
    id: 'p1',
    username: 'Vega',
    avatarId: 'operator-01',
    x,
    y,
    isLocal: true,
  });
}

describe('applyInput', () => {
  it('converts a direction into velocity at the shared speed', () => {
    const world = openWorld();
    const entity = player(world);

    applyInput(entity, input(1, 0));
    assert.equal(entity.velocity.x, PLAYER_BASE_SPEED);
    assert.equal(entity.velocity.y, 0);
  });

  it('scales speed by joystick magnitude', () => {
    const world = openWorld();
    const entity = player(world);

    // A thumb pushed halfway should walk, not run. A keyboard cannot express
    // this, but a stick should.
    applyInput(entity, input(1, 0, 0.5));
    assert.equal(entity.velocity.x, PLAYER_BASE_SPEED * 0.5);
  });

  it('never exceeds base speed even if magnitude is over-reported', () => {
    const world = openWorld();
    const entity = player(world);

    applyInput(entity, input(1, 0, 5));
    assert.equal(entity.velocity.x, PLAYER_BASE_SPEED);
  });

  it('does not move a dead player', () => {
    const world = openWorld();
    const entity = player(world);
    entity.alive = false;

    applyInput(entity, input(1, 1));
    assert.equal(entity.velocity.x, 0);
    assert.equal(entity.velocity.y, 0);
  });
});

describe('diagonal movement', () => {
  it('is no faster than moving along one axis', () => {
    const world = openWorld();

    const straight = spawnEntity(world, {
      id: 'straight',
      username: 'A',
      avatarId: 'operator-01',
      x: 200,
      y: 200,
    });
    const diagonal = spawnEntity(world, {
      id: 'diagonal',
      username: 'B',
      avatarId: 'operator-02',
      x: 600,
      y: 200,
    });

    // A normalised diagonal. The input layer guarantees this; if it ever
    // stopped, a player holding W and D would move 41% faster - the classic
    // bug, and one the server would reject as a speed hack.
    const unit = Math.SQRT1_2;
    applyInput(straight, input(1, 0));
    applyInput(diagonal, input(unit, unit));

    for (let i = 0; i < 60; i++) {
      stepEntity(straight, world, STEP);
      stepEntity(diagonal, world, STEP);
    }

    const straightDistance = Math.hypot(straight.position.x - 200, straight.position.y - 200);
    const diagonalDistance = Math.hypot(diagonal.position.x - 600, diagonal.position.y - 200);

    assert.ok(
      Math.abs(straightDistance - diagonalDistance) < 0.001,
      `straight ${straightDistance} vs diagonal ${diagonalDistance}`,
    );
  });
});

describe('stepEntity', () => {
  it('records the previous position for interpolation', () => {
    const world = openWorld();
    const entity = player(world);

    applyInput(entity, input(1, 0));
    stepEntity(entity, world, STEP);

    assert.equal(entity.previous.x, 400);
    assert.ok(entity.position.x > 400);
  });

  it('integrates at the same rate regardless of step count', () => {
    const world = openWorld();
    const entity = player(world, 100, 100);
    applyInput(entity, input(1, 0));

    // One second of simulation, in sixtieths.
    for (let i = 0; i < 60; i++) stepEntity(entity, world, STEP);

    assert.ok(
      Math.abs(entity.position.x - (100 + PLAYER_BASE_SPEED)) < 0.5,
      `moved to ${entity.position.x}`,
    );
  });

  it('stops the player at a wall instead of passing through', () => {
    const world = openWorld();
    world.obstacles = [{ x: 500, y: 300, width: 40, height: 200 }];

    const entity = player(world, 400, 400);
    applyInput(entity, input(1, 0));
    for (let i = 0; i < 120; i++) stepEntity(entity, world, STEP);

    // Two seconds of walking right would carry it well past x=540 unimpeded.
    assert.ok(entity.position.x < 500, `walked through the wall to ${entity.position.x}`);
  });

  it('slides along a wall rather than sticking', () => {
    const world = openWorld();
    world.obstacles = [{ x: 500, y: 0, width: 40, height: 800 }];

    const entity = player(world, 400, 400);
    // Pushing diagonally into a vertical wall: the x component is cancelled,
    // the y component should survive.
    applyInput(entity, input(Math.SQRT1_2, Math.SQRT1_2));
    for (let i = 0; i < 120; i++) stepEntity(entity, world, STEP);

    assert.ok(entity.position.x < 500, 'should be stopped horizontally');
    assert.ok(entity.position.y > 500, `should still slide down, y=${entity.position.y}`);
  });

  it('keeps the player inside the world bounds', () => {
    const world = openWorld();
    const entity = player(world, 100, 100);

    applyInput(entity, input(-1, -1));
    for (let i = 0; i < 300; i++) stepEntity(entity, world, STEP);

    assert.ok(entity.position.x >= world.bounds.minX + entity.radius - 0.001);
    assert.ok(entity.position.y >= world.bounds.minY + entity.radius - 0.001);
  });

  it('faces the direction of travel', () => {
    const world = openWorld();
    const entity = player(world);

    applyInput(entity, input(-1, 0));
    stepEntity(entity, world, STEP);
    assert.equal(entity.facing, Facing.LEFT);

    applyInput(entity, input(1, 0));
    stepEntity(entity, world, STEP);
    assert.equal(entity.facing, Facing.RIGHT);
  });

  it('does not flip the sprite when moving straight up or down', () => {
    const world = openWorld();
    const entity = player(world);
    entity.facing = Facing.LEFT;

    applyInput(entity, input(0, -1));
    stepEntity(entity, world, STEP);

    assert.equal(entity.facing, Facing.LEFT, 'vertical movement should not change facing');
  });

  it('switches between idle and walk animations', () => {
    const world = openWorld();
    const entity = player(world);

    assert.equal(entity.animation, AnimationState.IDLE);

    applyInput(entity, input(1, 0));
    stepEntity(entity, world, STEP);
    assert.equal(entity.animation, AnimationState.WALK);

    applyInput(entity, input(0, 0, 0));
    stepEntity(entity, world, STEP);
    assert.equal(entity.animation, AnimationState.IDLE);
  });

  it('restarts the animation clock on a state change', () => {
    const world = openWorld();
    const entity = player(world);

    applyInput(entity, input(0, 0, 0));
    for (let i = 0; i < 10; i++) stepEntity(entity, world, STEP);
    assert.ok(entity.animationTime > 0);

    applyInput(entity, input(1, 0));
    stepEntity(entity, world, STEP);
    // A cycle should always start at its first frame.
    assert.equal(entity.animationTime, 0);
  });

  it('marks a dead entity with the dead animation', () => {
    const world = openWorld();
    const entity = player(world);
    entity.alive = false;

    applyInput(entity, input(1, 0));
    stepEntity(entity, world, STEP);

    assert.equal(entity.animation, AnimationState.DEAD);
    assert.equal(entity.position.x, 400, 'a dead player should not drift');
  });
});
