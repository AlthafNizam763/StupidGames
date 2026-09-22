import {
  AnimationState,
  Facing,
  MAX_POSITION_DELTA,
  MOVEMENT_SPEED_TOLERANCE,
  PLAYER_BASE_SPEED,
  PLAYER_RADIUS,
  type MapRect,
  type MovementInput,
  type Vec2,
} from '@voidline/shared';
import { zoneAt } from './maps';
import type { Match, MatchPlayer } from './match/types';

/**
 * Authoritative movement (§16, §30).
 *
 * The client sends a *direction*; the server integrates it. This is the whole
 * anti-cheat story for movement, and it is structural rather than detective: a
 * payload with no coordinate in it cannot carry a forged coordinate. There is
 * nothing to validate because there is nothing to lie about except how often
 * you ask to move, which the rate limiter and the sequence guard cover.
 *
 * The client runs the same integration locally as prediction, so a player moves
 * the instant they press a key. When the two disagree beyond tolerance the
 * server sends a correction and the client accepts it - the server's number is
 * the real one, always.
 */

/** Result of applying one input. */
export interface MovementResult {
  accepted: boolean;
  /** True when the client's prediction has drifted enough to need correcting. */
  needsCorrection: boolean;
  reason?: 'replay' | 'dead' | 'frozen' | 'malformed';
}

/** How far the client may drift before it is corrected, in world units. */
const CORRECTION_THRESHOLD = 24;

/** Largest client-reported frame time the server will integrate. */
const MAX_DELTA_MS = 100;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Records a movement intent.
 *
 * Does not move the player: it sets the velocity the tick loop will integrate.
 * Separating intent from integration is what keeps movement framerate
 * independent on the server regardless of how often a client sends.
 */
export function applyInput(
  match: Match,
  player: MatchPlayer,
  input: MovementInput,
  now = Date.now(),
): MovementResult {
  if (!player.alive) return { accepted: false, needsCorrection: false, reason: 'dead' };

  // Movement is frozen outside the phases that allow it (§27). A client that
  // keeps sending during a council is not cheating, just optimistic.
  if (match.phase !== 'PLAYING' && match.phase !== 'SABOTAGE') {
    return { accepted: false, needsCorrection: false, reason: 'frozen' };
  }

  if (
    !isFiniteNumber(input.sequence) ||
    !isFiniteNumber(input.deltaMs) ||
    !input.direction ||
    !isFiniteNumber(input.direction.x) ||
    !isFiniteNumber(input.direction.y)
  ) {
    return { accepted: false, needsCorrection: false, reason: 'malformed' };
  }

  /*
   * Strictly newer, so a replayed or reordered packet is dropped. Without this
   * a captured burst of legitimate inputs could be resent to move further than
   * time allows - a speed hack made entirely of valid messages.
   */
  if (input.sequence <= player.lastInputSequence) {
    return { accepted: false, needsCorrection: false, reason: 'replay' };
  }

  player.lastInputSequence = input.sequence;
  player.lastInputAt = now;

  // Normalised here rather than trusted. A client sending a direction of length
  // 5 would otherwise move five times as fast; length is the one part of this
  // payload that could carry an exploit.
  const magnitude = Math.hypot(input.direction.x, input.direction.y);
  if (magnitude > 0.0001) {
    const scale = Math.min(1, magnitude) / magnitude;
    player.velocity.x = input.direction.x * scale * PLAYER_BASE_SPEED;
    player.velocity.y = input.direction.y * scale * PLAYER_BASE_SPEED;
  } else {
    player.velocity.x = 0;
    player.velocity.y = 0;
  }

  return { accepted: true, needsCorrection: false };
}

/**
 * Advances one player by one server tick.
 *
 * Collision is resolved against the map the server authored, which is the same
 * geometry the client was shipped - so both sides land on the same answer and
 * corrections stay rare.
 */
export function stepPlayer(match: Match, player: MatchPlayer, dt: number): void {
  if (!player.alive || (player.velocity.x === 0 && player.velocity.y === 0)) {
    player.animation = player.alive ? AnimationState.IDLE : AnimationState.DEAD;
    return;
  }

  const startX = player.position.x;
  const startY = player.position.y;

  let nextX = startX + player.velocity.x * dt;
  let nextY = startY + player.velocity.y * dt;

  /*
   * A hard ceiling on how far one tick may move anything.
   *
   * The velocity is already clamped above, so this should never fire for a
   * legitimate client - it is the backstop for a bug or an unexpected dt, and
   * it is what stops any single tick becoming a teleport.
   */
  const delta = Math.hypot(nextX - startX, nextY - startY);
  const ceiling = PLAYER_BASE_SPEED * MOVEMENT_SPEED_TOLERANCE * dt;
  if (delta > Math.max(ceiling, MAX_POSITION_DELTA)) {
    const scale = Math.max(ceiling, MAX_POSITION_DELTA) / delta;
    nextX = startX + (nextX - startX) * scale;
    nextY = startY + (nextY - startY) * scale;
  }

  const resolved = resolveAgainstWalls(match.map.walls, nextX, nextY, PLAYER_RADIUS);

  player.position.x = clamp(
    resolved.x,
    match.map.bounds.x + PLAYER_RADIUS,
    match.map.bounds.x + match.map.bounds.width - PLAYER_RADIUS,
  );
  player.position.y = clamp(
    resolved.y,
    match.map.bounds.y + PLAYER_RADIUS,
    match.map.bounds.y + match.map.bounds.height - PLAYER_RADIUS,
  );

  if (Math.abs(player.velocity.x) > 1) {
    player.facing = player.velocity.x < 0 ? Facing.LEFT : Facing.RIGHT;
  }
  player.animation = AnimationState.WALK;
  player.zone = zoneAt(match.map, player.position.x, player.position.y);
}

/**
 * Whether the client's own idea of where it is has drifted too far.
 *
 * Called with the position the client reports it predicted. A correction is
 * sent only past the threshold: correcting every small difference would fight
 * the client's prediction and produce visible rubber-banding on a normal
 * connection.
 */
export function needsCorrection(player: MatchPlayer, clientPosition: Vec2): boolean {
  return (
    Math.hypot(clientPosition.x - player.position.x, clientPosition.y - player.position.y) >
    CORRECTION_THRESHOLD
  );
}

/** Clamps a client-reported frame time into something safe to integrate. */
export function sanitiseDelta(deltaMs: number): number {
  if (!isFiniteNumber(deltaMs) || deltaMs <= 0) return 0;
  return Math.min(deltaMs, MAX_DELTA_MS);
}

/* ------------------------------------------------------------ collision - */

function resolveAgainstWalls(
  walls: readonly MapRect[],
  x: number,
  y: number,
  radius: number,
): { x: number; y: number } {
  let px = x;
  let py = y;

  /*
   * A linear scan over every wall.
   *
   * The client uses a spatial grid; the server does not need one yet - 69 walls
   * times fifteen players times twenty ticks is about 20,000 cheap checks a
   * second, which is nothing next to the work of serialising snapshots. A
   * broadphase is an optimisation and never changes the result, so the two
   * sides can differ here without ever disagreeing about where a player ends
   * up.
   */
  for (const wall of walls) {
    const closestX = Math.min(Math.max(px, wall.x), wall.x + wall.width);
    const closestY = Math.min(Math.max(py, wall.y), wall.y + wall.height);

    const dx = px - closestX;
    const dy = py - closestY;
    const distanceSq = dx * dx + dy * dy;

    if (distanceSq >= radius * radius) continue;

    if (distanceSq > 0.000001) {
      const distance = Math.sqrt(distanceSq);
      const overlap = radius - distance;
      px += (dx / distance) * overlap;
      py += (dy / distance) * overlap;
      continue;
    }

    // Centre exactly on the wall: no direction to push, so eject through the
    // nearest face.
    const left = px - wall.x;
    const right = wall.x + wall.width - px;
    const top = py - wall.y;
    const bottom = wall.y + wall.height - py;
    const minimum = Math.min(left, right, top, bottom);

    if (minimum === left) px -= left + radius;
    else if (minimum === right) px += right + radius;
    else if (minimum === top) py -= top + radius;
    else py += bottom + radius;
  }

  return { x: px, y: py };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Distance between two players. Used by elimination and reporting range checks. */
export function distanceBetween(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
