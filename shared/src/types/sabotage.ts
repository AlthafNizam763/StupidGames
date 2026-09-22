import type { ZoneId } from '../constants/map';
import type { EpochMs } from './common';

export const SabotageType = {
  /** Critical. Reactor breaches and the Saboteurs win unless repaired in time. */
  REACTOR_FAILURE: 'REACTOR_FAILURE',
  /** Critical. Station oxygen runs out unless repaired in time. */
  OXYGEN_LEAK: 'OXYGEN_LEAK',
  /** Non-critical. Suppresses zone reporting and the objective bar. */
  COMMUNICATION_FAILURE: 'COMMUNICATION_FAILURE',
  /** Non-critical. Collapses Operator vision radius. */
  POWER_FAILURE: 'POWER_FAILURE',
  /** Non-critical. Seals the doors of one zone for a fixed duration. */
  DOOR_LOCKDOWN: 'DOOR_LOCKDOWN',
} as const;
export type SabotageType = (typeof SabotageType)[keyof typeof SabotageType];

export const SABOTAGE_LABELS: Readonly<Record<SabotageType, string>> = {
  REACTOR_FAILURE: 'Reactor Failure',
  OXYGEN_LEAK: 'Oxygen Leak',
  COMMUNICATION_FAILURE: 'Communication Failure',
  POWER_FAILURE: 'Power Failure',
  DOOR_LOCKDOWN: 'Door Lockdown',
};

/**
 * Per-type tuning. A critical sabotage moves the room into the SABOTAGE phase
 * and ends the match on `countdown` expiry; a non-critical one is a modifier
 * that simply expires after `duration`.
 */
export interface SabotageRule {
  critical: boolean;
  /** Seconds until the Saboteurs win. Critical only. */
  countdown: number | null;
  /** Seconds until the effect lapses by itself. Non-critical only. */
  duration: number | null;
  /** Seconds before any sabotage may be triggered again. */
  cooldown: number;
  /** How many separate repair stations must be operated to clear it. */
  repairStations: number;
}

export const SABOTAGE_RULES: Readonly<Record<SabotageType, SabotageRule>> = {
  REACTOR_FAILURE: {
    critical: true,
    countdown: 45,
    duration: null,
    cooldown: 35,
    repairStations: 2,
  },
  OXYGEN_LEAK: {
    critical: true,
    countdown: 45,
    duration: null,
    cooldown: 35,
    repairStations: 2,
  },
  COMMUNICATION_FAILURE: {
    critical: false,
    countdown: null,
    duration: 40,
    cooldown: 30,
    repairStations: 1,
  },
  POWER_FAILURE: {
    critical: false,
    countdown: null,
    duration: 40,
    cooldown: 30,
    repairStations: 1,
  },
  DOOR_LOCKDOWN: {
    critical: false,
    countdown: null,
    duration: 15,
    cooldown: 20,
    repairStations: 0,
  },
};

/**
 * Active sabotage, broadcast identically to both teams.
 *
 * SECURITY: the Saboteur who triggered it is never included. If Operators could
 * see the trigger, sabotage would be a confession rather than a tactic.
 */
export interface SabotageState {
  type: SabotageType;
  critical: boolean;
  /** Zone affected. Null for station-wide sabotages. */
  zone: ZoneId | null;
  startedAt: EpochMs;
  /** Epoch ms at which the match is lost, or the effect lapses. */
  endsAt: EpochMs;
  /** Repair stations already operated. */
  repairedStations: number;
  requiredStations: number;
}

export interface SabotageCooldownState {
  /** Epoch ms at which the Saboteur team may sabotage again. Saboteurs only. */
  availableAt: EpochMs;
}
