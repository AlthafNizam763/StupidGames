import {
  INTERACT_RANGE,
  PlayerRole,
  SABOTAGE_RULES,
  SabotageType,
  type SabotageState,
} from '@voidline/shared';
import { distanceBetween } from './MovementManager';
import type { Match, MatchPlayer } from './match/types';

/**
 * Sabotage (§19).
 *
 * Two kinds, and the difference decides everything:
 *
 * - **Critical** (reactor, oxygen) runs a countdown that ends the match if it
 *   expires. It moves the room into the SABOTAGE phase and needs two repair
 *   stations worked, which forces the crew to split up.
 * - **Non-critical** (comms, power, lockdown) is a modifier that lapses on its
 *   own. The room stays in PLAYING, because nothing about it can end a match.
 *
 * As with elimination, nothing here records or emits who triggered it. A
 * sabotage that named its author would be a confession rather than a tactic.
 */

export const SabotageError = {
  DEAD: 'DEAD',
  NOT_SABOTEUR: 'NOT_SABOTEUR',
  WRONG_PHASE: 'WRONG_PHASE',
  MEETING_ACTIVE: 'MEETING_ACTIVE',
  ALREADY_ACTIVE: 'ALREADY_ACTIVE',
  COOLDOWN: 'COOLDOWN',
  UNKNOWN_TYPE: 'UNKNOWN_TYPE',
} as const;
export type SabotageError = (typeof SabotageError)[keyof typeof SabotageError];

export const RepairError = {
  DEAD: 'DEAD',
  NOT_ACTIVE: 'NOT_ACTIVE',
  UNKNOWN_STATION: 'UNKNOWN_STATION',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  ALREADY_REPAIRED: 'ALREADY_REPAIRED',
} as const;
export type RepairError = (typeof RepairError)[keyof typeof RepairError];

export function startSabotage(
  match: Match,
  actor: MatchPlayer,
  type: SabotageType,
  now = Date.now(),
): { ok: true; sabotage: SabotageState } | { ok: false; error: SabotageError } {
  if (!actor.alive) return { ok: false, error: SabotageError.DEAD };
  if (actor.role !== PlayerRole.SABOTEUR) return { ok: false, error: SabotageError.NOT_SABOTEUR };

  // PLAYING only. A second sabotage cannot be stacked on a critical one, and a
  // council is not a window to start one from.
  if (match.phase !== 'PLAYING') return { ok: false, error: SabotageError.WRONG_PHASE };
  if (match.meeting) return { ok: false, error: SabotageError.MEETING_ACTIVE };
  if (match.sabotage) return { ok: false, error: SabotageError.ALREADY_ACTIVE };

  const rule = SABOTAGE_RULES[type];
  if (!rule) return { ok: false, error: SabotageError.UNKNOWN_TYPE };

  // The cooldown belongs to the Saboteur *team*, not the individual. Otherwise
  // two Saboteurs could alternate and keep the station permanently broken.
  if (now < match.sabotageAvailableAt) return { ok: false, error: SabotageError.COOLDOWN };

  const durationSeconds = rule.critical ? rule.countdown! : rule.duration!;

  const sabotage: SabotageState = {
    type,
    critical: rule.critical,
    zone: type === SabotageType.DOOR_LOCKDOWN ? actor.zone : null,
    startedAt: now,
    endsAt: now + durationSeconds * 1000,
    repairedStations: 0,
    requiredStations: rule.repairStations,
  };

  match.sabotage = sabotage;
  match.repairedStations.clear();
  match.sabotageAvailableAt = now + rule.cooldown * 1000;

  return { ok: true, sabotage };
}

/**
 * Works one repair station.
 *
 * Returns the updated sabotage, or null when that repair cleared it. A critical
 * sabotage needs every station worked; the map places them far apart so one
 * player cannot clear it alone.
 */
export function repair(
  match: Match,
  player: MatchPlayer,
  stationId: string,
): { ok: true; sabotage: SabotageState | null } | { ok: false; error: RepairError } {
  if (!player.alive) return { ok: false, error: RepairError.DEAD };

  const sabotage = match.sabotage;
  if (!sabotage) return { ok: false, error: RepairError.NOT_ACTIVE };

  const station = match.map.repairStations.find((candidate) => candidate.id === stationId);
  if (!station) return { ok: false, error: RepairError.UNKNOWN_STATION };

  if (match.repairedStations.has(stationId)) {
    return { ok: false, error: RepairError.ALREADY_REPAIRED };
  }

  if (distanceBetween(player.position, station.position) > INTERACT_RANGE) {
    return { ok: false, error: RepairError.OUT_OF_RANGE };
  }

  match.repairedStations.add(stationId);
  sabotage.repairedStations = match.repairedStations.size;

  if (sabotage.repairedStations >= sabotage.requiredStations) {
    match.sabotage = null;
    match.repairedStations.clear();
    return { ok: true, sabotage: null };
  }

  return { ok: true, sabotage };
}

/**
 * Whether a critical sabotage has run out.
 *
 * Called from the tick loop. A non-critical sabotage expiring is not a loss -
 * it simply lapses, which `expireIfLapsed` handles.
 */
export function criticalExpired(match: Match, now = Date.now()): boolean {
  return Boolean(match.sabotage?.critical && now >= match.sabotage.endsAt);
}

/** Clears a non-critical sabotage that has run its course. Returns true if it did. */
export function expireIfLapsed(match: Match, now = Date.now()): boolean {
  const sabotage = match.sabotage;
  if (!sabotage || sabotage.critical) return false;
  if (now < sabotage.endsAt) return false;

  match.sabotage = null;
  match.repairedStations.clear();
  return true;
}

/**
 * Clears any sabotage when a meeting begins.
 *
 * Only the non-critical ones. A critical countdown deliberately keeps running
 * through a council - that tension is the reason calling a meeting during a
 * reactor breach is a decision rather than a free action.
 */
export function clearNonCriticalForMeeting(match: Match): void {
  if (match.sabotage && !match.sabotage.critical) {
    match.sabotage = null;
    match.repairedStations.clear();
  }
}

/** True while a comms sabotage is suppressing location reporting. */
export function commsDown(match: Match): boolean {
  return match.sabotage?.type === SabotageType.COMMUNICATION_FAILURE;
}
