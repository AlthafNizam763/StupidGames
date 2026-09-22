import type { ZoneId } from '../constants/map';
import type { Vec2 } from './common';
import type { PlayerId } from './player';

export type TaskId = string;

/** The seven original objective mini-games. */
export const TaskType = {
  /** Align energy nodes to a target phase. */
  REACTOR_CALIBRATION: 'REACTOR_CALIBRATION',
  /** Connect signal paths across a routing grid. */
  SIGNAL_ROUTING: 'SIGNAL_ROUTING',
  /** Adjust pressure valves into the safe band. */
  OXYGEN_BALANCING: 'OXYGEN_BALANCING',
  /** Restore corrupted data blocks in order. */
  DATA_RECOVERY: 'DATA_RECOVERY',
  /** Match timing indicators across generators. */
  POWER_SYNCHRONIZATION: 'POWER_SYNCHRONIZATION',
  /** Match a scan pattern against a reference. */
  SECURITY_SCAN: 'SECURITY_SCAN',
  /** Align orbital coordinates on a nav plot. */
  NAVIGATION_CALIBRATION: 'NAVIGATION_CALIBRATION',
} as const;
export type TaskType = (typeof TaskType)[keyof typeof TaskType];

export const ALL_TASK_TYPES: readonly TaskType[] = [
  TaskType.REACTOR_CALIBRATION,
  TaskType.SIGNAL_ROUTING,
  TaskType.OXYGEN_BALANCING,
  TaskType.DATA_RECOVERY,
  TaskType.POWER_SYNCHRONIZATION,
  TaskType.SECURITY_SCAN,
  TaskType.NAVIGATION_CALIBRATION,
];

export const TASK_LABELS: Readonly<Record<TaskType, string>> = {
  REACTOR_CALIBRATION: 'Reactor Calibration',
  SIGNAL_ROUTING: 'Signal Routing',
  OXYGEN_BALANCING: 'Oxygen Balancing',
  DATA_RECOVERY: 'Data Recovery',
  POWER_SYNCHRONIZATION: 'Power Synchronization',
  SECURITY_SCAN: 'Security Scan',
  NAVIGATION_CALIBRATION: 'Navigation Calibration',
};

export const TaskStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETE: 'COMPLETE',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

/** A terminal placed on the map. Static map data, not per-match state. */
export interface TaskTerminal {
  id: string;
  type: TaskType;
  zone: ZoneId;
  position: Vec2;
}

/**
 * One objective assigned to one player for one match.
 *
 * `steps` supports multi-stage objectives: `progress` counts completed steps, so
 * a two-stage objective contributes to the team bar twice.
 */
export interface TaskAssignment {
  id: TaskId;
  type: TaskType;
  zone: ZoneId;
  terminalId: string;
  /** Expected duration in seconds. UI hint only; never used to verify. */
  duration: number;
  steps: number;
  progress: number;
  status: TaskStatus;
}

/**
 * A submitted solution. The *shape* is generic on purpose: each mini-game's
 * payload is validated by its own server-side verifier in PHASE 13, and the
 * server holds the expected solution - it is never sent to the client.
 */
export interface TaskSubmission {
  taskId: TaskId;
  step: number;
  /** Mini-game specific solution data. Opaque to the protocol. */
  solution: unknown;
  /** Client-measured solve time in ms. Sanity-checked, never trusted. */
  elapsedMs: number;
}

/** The team objective bar. The only task information Saboteurs receive. */
export interface TeamTaskProgress {
  completed: number;
  total: number;
  /** 0-1, pre-computed so every client renders an identical bar. */
  ratio: number;
}

export interface TaskCompletedEvent {
  taskId: TaskId;
  playerId: PlayerId;
  team: TeamTaskProgress;
}
