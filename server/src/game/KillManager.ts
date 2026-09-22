import { randomUUID } from 'node:crypto';
import {
  ELIMINATION_RANGE,
  PlayerRole,
  REPORT_RANGE,
  type DeadBody,
} from '@voidline/shared';
import { distanceBetween } from './MovementManager';
import { zoneAt } from './maps';
import type { Match, MatchPlayer } from './match/types';

/**
 * Elimination and body discovery (§20, §21).
 *
 * The seven checks below are the whole of the elimination rule, and they run in
 * this order every time. There is no path into `eliminate` that skips one.
 *
 * The single most important property of this file is what it does NOT produce:
 * no return value, no event and no state written here names the killer. Working
 * out who did it is the entire game, and a server that leaks it in a payload
 * has given away the thing the players are trying to deduce.
 */

export const KillError = {
  DEAD: 'DEAD',
  NOT_SABOTEUR: 'NOT_SABOTEUR',
  TARGET_INVALID: 'TARGET_INVALID',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  COOLDOWN: 'COOLDOWN',
  WRONG_PHASE: 'WRONG_PHASE',
  MEETING_ACTIVE: 'MEETING_ACTIVE',
} as const;
export type KillError = (typeof KillError)[keyof typeof KillError];

export interface EliminationOutcome {
  /** The victim. Deliberately the only identity in this object. */
  victimId: string;
  body: DeadBody;
}

/**
 * Attempts an elimination.
 *
 * Every check reads server state. `killer` is resolved from the socket's
 * authenticated identity by the caller, never from the payload - the payload
 * carries only who the killer wants to eliminate.
 */
export function eliminate(
  match: Match,
  killer: MatchPlayer,
  targetId: string,
  now = Date.now(),
): { ok: true; outcome: EliminationOutcome } | { ok: false; error: KillError } {
  // 1. The killer is alive.
  if (!killer.alive) return { ok: false, error: KillError.DEAD };

  // 2. The killer is a Saboteur.
  if (killer.role !== PlayerRole.SABOTEUR) return { ok: false, error: KillError.NOT_SABOTEUR };

  // 6. The phase allows it. Checked early because it is the cheapest.
  if (match.phase !== 'PLAYING' && match.phase !== 'SABOTAGE') {
    return { ok: false, error: KillError.WRONG_PHASE };
  }

  // 7. No meeting is running.
  if (match.meeting) return { ok: false, error: KillError.MEETING_ACTIVE };

  // 5. Cooldown has elapsed.
  if (killer.killCooldownEndsAt !== null && now < killer.killCooldownEndsAt) {
    return { ok: false, error: KillError.COOLDOWN };
  }

  // 3. The target exists, is alive, and is not a fellow Saboteur.
  const target = match.players.get(targetId);
  if (!target || !target.alive || target.userId === killer.userId) {
    return { ok: false, error: KillError.TARGET_INVALID };
  }
  if (target.role === PlayerRole.SABOTEUR) {
    // Refused with the same error as any other invalid target. A distinct
    // error would let a Saboteur probe who their allies are by trying.
    return { ok: false, error: KillError.TARGET_INVALID };
  }

  // 4. Distance, against server-held positions on both sides.
  if (distanceBetween(killer.position, target.position) > ELIMINATION_RANGE) {
    return { ok: false, error: KillError.OUT_OF_RANGE };
  }

  target.alive = false;
  target.velocity.x = 0;
  target.velocity.y = 0;

  killer.killCooldownEndsAt = now + match.settings.killCooldown * 1000;
  killer.eliminations += 1;

  const body: DeadBody = {
    id: randomUUID(),
    playerId: target.userId,
    position: { x: target.position.x, y: target.position.y },
    zone: zoneAt(match.map, target.position.x, target.position.y),
    reported: false,
  };
  match.bodies.push(body);

  /*
   * The killer's identity stops here. It is not on the body, not on the
   * outcome, and not written anywhere a serialiser can reach. The only record
   * is `killer.eliminations`, which is private until the results screen - when
   * every role is public anyway.
   */
  return { ok: true, outcome: { victimId: target.userId, body } };
}

/* --------------------------------------------------------- reporting - */

export const ReportError = {
  DEAD: 'DEAD',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_REPORTED: 'ALREADY_REPORTED',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  WRONG_PHASE: 'WRONG_PHASE',
  MEETING_ACTIVE: 'MEETING_ACTIVE',
} as const;
export type ReportError = (typeof ReportError)[keyof typeof ReportError];

/**
 * Reports a body.
 *
 * Any living player may report, Saboteurs included - reporting your own victim
 * is a real tactic and refusing it would identify them.
 */
export function reportBody(
  match: Match,
  reporter: MatchPlayer,
  bodyId: string,
): { ok: true; body: DeadBody } | { ok: false; error: ReportError } {
  if (!reporter.alive) return { ok: false, error: ReportError.DEAD };
  if (match.phase !== 'PLAYING' && match.phase !== 'SABOTAGE') {
    return { ok: false, error: ReportError.WRONG_PHASE };
  }
  if (match.meeting) return { ok: false, error: ReportError.MEETING_ACTIVE };

  const body = match.bodies.find((candidate) => candidate.id === bodyId);
  if (!body) return { ok: false, error: ReportError.NOT_FOUND };
  if (body.reported) return { ok: false, error: ReportError.ALREADY_REPORTED };

  if (distanceBetween(reporter.position, body.position) > REPORT_RANGE) {
    return { ok: false, error: ReportError.OUT_OF_RANGE };
  }

  body.reported = true;
  return { ok: true, body };
}

/** Starts every Saboteur on cooldown, so nobody is eliminated on the first tick. */
export function primeCooldowns(match: Match, now = Date.now()): void {
  const initial = now + match.settings.killCooldown * 1000;

  for (const player of match.players.values()) {
    player.killCooldownEndsAt = player.role === PlayerRole.SABOTEUR ? initial : null;
  }
}

/**
 * Resets cooldowns after a meeting.
 *
 * Without this, a Saboteur could eliminate the instant a council ends, before
 * anyone has moved - which makes the meeting itself dangerous to call.
 */
export function resetCooldownsAfterMeeting(match: Match, now = Date.now()): void {
  const next = now + match.settings.killCooldown * 1000;

  for (const player of match.players.values()) {
    if (player.role === PlayerRole.SABOTEUR && player.alive) {
      player.killCooldownEndsAt = next;
    }
  }
}
