import {
  MOVEMENT_INPUT_INTERVAL_MS,
  type GameSnapshot,
  type MovementDelta,
  type PublicPlayerState,
} from '@voidline/shared';
import { spawnEntity } from '../entities/World';
import type { Entity, InputSnapshot, World } from '../engine/types';

/**
 * Reconciling the local world with the server's (§16).
 *
 * Three jobs, and they are different for the local player and everyone else:
 *
 * - **Remote players** are interpolated toward the last position the server
 *   sent. Their input is not known here, so predicting them would be guessing;
 *   following a fraction behind is honest and looks smooth.
 * - **The local player** is predicted locally and only corrected when it has
 *   drifted past a threshold. Snapping them to every snapshot would produce
 *   rubber-banding on any connection with latency.
 * - **Input** is sent as a direction at a fixed rate, with a sequence number.
 *
 * The threshold matters. Too tight and a normal connection fights itself; too
 * loose and a player can visibly walk through a wall before being pulled back.
 */

/** How far the local player may drift before being corrected, in world units. */
const CORRECTION_THRESHOLD = 24;

/** Above this, snap rather than ease - the difference is too big to hide. */
const SNAP_THRESHOLD = 160;

/**
 * How quickly a remote player catches up to their last known position.
 *
 * Exponential damping, framerate independent. Higher is more responsive and
 * more jittery; this is tuned to absorb one dropped packet without visibly
 * lagging.
 */
const REMOTE_FOLLOW = 14;

export class NetworkSync {
  private sequence = 0;
  private lastSentAt = 0;
  /** Server positions, keyed by player id, awaiting interpolation. */
  private readonly targets = new Map<string, { x: number; y: number }>();

  /**
   * Applies a full snapshot.
   *
   * Adds entities that have appeared, removes those that have gone, and updates
   * everything the delta stream does not carry - alive state, connection,
   * appearance.
   */
  applySnapshot(world: World, snapshot: GameSnapshot, localId: string | null): void {
    const seen = new Set<string>();

    for (const player of snapshot.players) {
      seen.add(player.id);

      let entity = world.entities.get(player.id);

      if (!entity) {
        entity = spawnEntity(world, {
          id: player.id,
          username: player.username,
          avatarId: player.avatar,
          x: player.position.x,
          y: player.position.y,
          isLocal: player.id === localId,
          alive: player.alive,
        });
      }

      this.applyPlayerState(entity, player, player.id === localId);
    }

    // Anyone the server no longer lists has left the match.
    for (const id of [...world.entities.keys()]) {
      if (!seen.has(id)) {
        world.entities.delete(id);
        this.targets.delete(id);
      }
    }
  }

  /** Applies a positional delta. Far smaller than a snapshot and far more frequent. */
  applyDelta(world: World, delta: MovementDelta, localId: string | null): void {
    for (const update of delta.players) {
      const entity = world.entities.get(update.id);
      if (!entity) continue;

      if (update.id === localId) {
        this.reconcileLocal(entity, update.position);
        continue;
      }

      entity.facing = update.facing;
      entity.animation = update.animation;
      this.targets.set(update.id, { x: update.position.x, y: update.position.y });
    }
  }

  private applyPlayerState(entity: Entity, player: PublicPlayerState, isLocal: boolean): void {
    entity.username = player.username;
    entity.alive = player.alive;
    entity.facing = player.facing;
    entity.animation = player.animation;

    if (isLocal) {
      this.reconcileLocal(entity, player.position);
    } else {
      this.targets.set(player.id, { x: player.position.x, y: player.position.y });
    }
  }

  /**
   * Corrects the local player, but only when it matters.
   *
   * Within the threshold the client's own prediction is left alone: it is
   * running the same integration the server is, so small differences are
   * latency rather than disagreement, and correcting them would be visible as
   * stutter.
   */
  private reconcileLocal(entity: Entity, serverPosition: { x: number; y: number }): void {
    const drift = Math.hypot(
      serverPosition.x - entity.position.x,
      serverPosition.y - entity.position.y,
    );

    if (drift < CORRECTION_THRESHOLD) return;

    if (drift > SNAP_THRESHOLD) {
      // Too far to blend - a teleport, a respawn, or a correction after a
      // stall. Easing across it would show the player sliding through walls.
      entity.position.x = serverPosition.x;
      entity.position.y = serverPosition.y;
      entity.previous.x = serverPosition.x;
      entity.previous.y = serverPosition.y;
      entity.render.x = serverPosition.x;
      entity.render.y = serverPosition.y;
      return;
    }

    // Blend most of the way. Not all, so a persistent disagreement converges
    // over a few frames rather than snapping every time a packet arrives.
    entity.position.x += (serverPosition.x - entity.position.x) * 0.5;
    entity.position.y += (serverPosition.y - entity.position.y) * 0.5;
  }

  /** Eases remote players toward their last known server position. */
  interpolateRemotes(world: World, dt: number): void {
    const t = 1 - Math.exp(-REMOTE_FOLLOW * dt);

    for (const [id, target] of this.targets) {
      const entity = world.entities.get(id);
      if (!entity || entity.isLocal) continue;

      entity.previous.x = entity.position.x;
      entity.previous.y = entity.position.y;
      entity.position.x += (target.x - entity.position.x) * t;
      entity.position.y += (target.y - entity.position.y) * t;
    }
  }

  /**
   * Sends the local player's input, at most `MOVEMENT_INPUT_HZ` times a second.
   *
   * Returns the payload to send, or null when it is not yet time. Rate limiting
   * here rather than at the socket means a well-behaved client never trips the
   * server's limiter - the two read the same constant.
   */
  buildInput(
    input: InputSnapshot,
    now: number,
  ): { sequence: number; direction: { x: number; y: number }; deltaMs: number } | null {
    if (now - this.lastSentAt < MOVEMENT_INPUT_INTERVAL_MS) return null;

    const deltaMs = this.lastSentAt === 0 ? MOVEMENT_INPUT_INTERVAL_MS : now - this.lastSentAt;
    this.lastSentAt = now;
    this.sequence += 1;

    return {
      sequence: this.sequence,
      direction: { x: input.direction.x, y: input.direction.y },
      deltaMs: Math.round(deltaMs),
    };
  }

  /**
   * Restarts the sequence counter.
   *
   * Called on reconnect. The server resets its own guard at the same moment, so
   * without this every packet after a reconnect would look like a replay and be
   * dropped - a player who came back and then could not move.
   */
  resetSequence(): void {
    this.sequence = 0;
    this.lastSentAt = 0;
  }

  clear(): void {
    this.targets.clear();
    this.resetSequence();
  }
}
