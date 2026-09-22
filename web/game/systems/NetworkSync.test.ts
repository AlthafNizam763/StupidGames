import {
  AnimationState,
  ConnectionState,
  DEFAULT_AVATAR_ID,
  Facing,
  GamePhase,
  MOVEMENT_INPUT_INTERVAL_MS,
  MapId,
  ZoneId,
  type DeadBody,
  type GameSnapshot,
  type MovementDelta,
  type PublicPlayerState,
} from '@voidline/shared';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createWorld, spawnEntity } from '../entities/World';
import { NetworkSync } from './NetworkSync';

/**
 * Client reconciliation (§16, §48).
 *
 * This is the seam where server authority meets local prediction, and it is
 * the one place on the client where getting the rule wrong is invisible: a
 * broken threshold does not throw, it just makes the game feel bad. So the
 * thresholds themselves are asserted rather than the fact that "something
 * moved".
 */

function player(overrides: Partial<PublicPlayerState> & { id: string }): PublicPlayerState {
  return {
    username: `p-${overrides.id}`,
    avatar: DEFAULT_AVATAR_ID,
    appearance: null,
    position: { x: 0, y: 0 },
    facing: Facing.RIGHT,
    animation: AnimationState.IDLE,
    alive: true,
    connection: ConnectionState.CONNECTED,
    zone: ZoneId.COMMAND_DECK,
    ...overrides,
  } as PublicPlayerState;
}

function snapshot(
  players: PublicPlayerState[],
  bodies: DeadBody[] = [],
): GameSnapshot {
  return {
    matchId: 'm1',
    map: MapId.ORBITAL_09,
    phase: GamePhase.PLAYING,
    timer: { phase: GamePhase.PLAYING, startedAt: 0, endsAt: null },
    players,
    bodies,
    tasks: { completed: 0, total: 0, percent: 0 },
    sabotage: null,
    meeting: null,
    serverTime: 0,
  } as unknown as GameSnapshot;
}

describe('NetworkSync snapshots', () => {
  it('spawns players it has not seen and drops players the server stopped listing', () => {
    const sync = new NetworkSync();
    const world = createWorld();

    sync.applySnapshot(world, snapshot([player({ id: 'a' }), player({ id: 'b' })]), 'a');
    assert.equal(world.entities.size, 2);
    assert.equal(world.entities.get('a')!.isLocal, true);
    assert.equal(world.entities.get('b')!.isLocal, false);

    // 'b' left the match.
    sync.applySnapshot(world, snapshot([player({ id: 'a' })]), 'a');
    assert.deepEqual([...world.entities.keys()], ['a']);
  });

  it('replaces bodies wholesale rather than accumulating them', () => {
    const sync = new NetworkSync();
    const world = createWorld();

    const body: DeadBody = {
      id: 'body-1',
      playerId: 'b',
      position: { x: 10, y: 10 },
      zone: ZoneId.COMMAND_DECK,
      reported: false,
    };

    sync.applySnapshot(world, snapshot([player({ id: 'a' })], [body]), 'a');
    assert.equal(world.bodies.length, 1);

    /*
     * A council clears the deck. If the client merged instead of replacing,
     * the body would survive here and the HUD would keep offering a report
     * that the server refuses - the player pressing a button that does
     * nothing, with no explanation.
     */
    sync.applySnapshot(world, snapshot([player({ id: 'a' })], []), 'a');
    assert.deepEqual(world.bodies, []);
  });
});

describe('NetworkSync local reconciliation', () => {
  const localAt = (x: number) => {
    const world = createWorld();
    const entity = spawnEntity(world, {
      id: 'a',
      username: 'a',
      avatarId: DEFAULT_AVATAR_ID,
      x,
      y: 0,
      isLocal: true,
    });
    return { world, entity };
  };

  it('leaves small drift alone, because that is latency and not disagreement', () => {
    const sync = new NetworkSync();
    const { world, entity } = localAt(100);

    // 10 units apart: inside the correction threshold.
    sync.applySnapshot(world, snapshot([player({ id: 'a', position: { x: 110, y: 0 } })]), 'a');

    assert.equal(entity.position.x, 100, 'the client corrected a difference it should have kept');
  });

  it('eases a moderate correction part of the way, not all of it', () => {
    const sync = new NetworkSync();
    const { world, entity } = localAt(100);

    // 60 units: past the correction threshold, under the snap threshold.
    sync.applySnapshot(world, snapshot([player({ id: 'a', position: { x: 160, y: 0 } })]), 'a');

    assert.equal(entity.position.x, 130, 'a moderate correction should blend halfway');
  });

  it('snaps a correction too large to hide', () => {
    const sync = new NetworkSync();
    const { world, entity } = localAt(100);

    // 400 units: a respawn or a post-stall correction. Easing across this
    // would draw the player sliding through the walls in between.
    sync.applySnapshot(world, snapshot([player({ id: 'a', position: { x: 500, y: 0 } })]), 'a');

    assert.equal(entity.position.x, 500);
    // The interpolation buffers move too, or the next frame renders the blend
    // from the old position and the snap is visible anyway.
    assert.equal(entity.previous.x, 500);
    assert.equal(entity.render.x, 500);
  });
});

describe('NetworkSync remote interpolation', () => {
  it('eases remote players toward the server position without overshooting', () => {
    const sync = new NetworkSync();
    const world = createWorld();

    sync.applySnapshot(world, snapshot([player({ id: 'a' }), player({ id: 'b' })]), 'a');

    const delta: MovementDelta = {
      players: [
        {
          id: 'b',
          position: { x: 100, y: 0 },
          facing: Facing.RIGHT,
          animation: AnimationState.WALK,
        },
      ],
      serverTime: 0,
    };
    sync.applyDelta(world, delta, 'a');

    const remote = world.entities.get('b')!;
    // The delta carries facing and animation immediately; only position eases.
    assert.equal(remote.facing, Facing.RIGHT);
    assert.equal(remote.position.x, 0, 'a delta should not teleport a remote player');

    sync.interpolateRemotes(world, 1 / 60);
    const afterOneFrame = remote.position.x;
    assert.ok(afterOneFrame > 0 && afterOneFrame < 100, `eased to ${afterOneFrame}`);

    // Converges rather than oscillating: many frames land on the target and
    // stay there.
    for (let i = 0; i < 120; i++) sync.interpolateRemotes(world, 1 / 60);
    assert.ok(Math.abs(remote.position.x - 100) < 0.5, `settled at ${remote.position.x}`);
  });

  it('never interpolates the local player, who is predicted instead', () => {
    const sync = new NetworkSync();
    const world = createWorld();

    sync.applySnapshot(world, snapshot([player({ id: 'a', position: { x: 400, y: 0 } })]), 'a');
    const local = world.entities.get('a')!;
    local.position.x = 0;

    sync.interpolateRemotes(world, 1 / 60);
    assert.equal(local.position.x, 0, 'the local player was dragged by the remote interpolator');
  });
});

describe('NetworkSync input', () => {
  it('sends a direction and never a position', () => {
    const sync = new NetworkSync();
    const input = { direction: { x: 1, y: 0 }, magnitude: 1, interact: false, action: false };

    const payload = sync.buildInput(input, 1000)!;
    assert.ok(payload);

    /*
     * The anti-cheat property, asserted on the payload itself. The server
     * integrates the direction, so there is no coordinate in this message for
     * a modified client to forge - and no amount of server-side validation
     * would help if the client were allowed to state where it is.
     */
    assert.deepEqual(Object.keys(payload).sort(), ['deltaMs', 'direction', 'sequence']);
    assert.equal('position' in payload, false);
  });

  it('rate limits to the same constant the server enforces', () => {
    const sync = new NetworkSync();
    const input = { direction: { x: 1, y: 0 }, magnitude: 1, interact: false, action: false };

    assert.ok(sync.buildInput(input, 1000), 'the first input should send');
    assert.equal(sync.buildInput(input, 1000 + MOVEMENT_INPUT_INTERVAL_MS / 2), null);
    assert.ok(sync.buildInput(input, 1000 + MOVEMENT_INPUT_INTERVAL_MS + 1));
  });

  it('restarts the sequence on reconnect, in step with the server guard', () => {
    const sync = new NetworkSync();
    const input = { direction: { x: 1, y: 0 }, magnitude: 1, interact: false, action: false };

    sync.buildInput(input, 1000);
    const second = sync.buildInput(input, 2000)!;
    assert.equal(second.sequence, 2);

    /*
     * Without this the server - which resets its own last-seen sequence when
     * the socket reattaches - would read every packet after a reconnect as a
     * replay and drop it. The symptom is a player who reconnects successfully
     * and then cannot move, which looks nothing like a sequence bug.
     */
    sync.resetSequence();
    assert.equal(sync.buildInput(input, 3000)!.sequence, 1);
  });
});
