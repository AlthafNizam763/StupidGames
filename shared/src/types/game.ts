import type { GamePhase } from '../constants/game';
import type { MapId } from '../constants/map';
import type { EpochMs } from './common';
import type { DeadBody, PlayerId, PublicPlayerState, SelfPlayerState } from './player';
import type { ChatMessage, MeetingState } from './meeting';
import type { SabotageState } from './sabotage';
import type { TaskAssignment, TeamTaskProgress } from './task';

export type MatchId = string;

/**
 * A phase deadline. The client counts down from `endsAt` locally rather than
 * being ticked by the server every second - one message instead of sixty, and
 * the countdown stays smooth across a hiccup.
 */
export interface PhaseTimer {
  phase: GamePhase;
  startedAt: EpochMs;
  /** Null for phases that have no deadline. */
  endsAt: EpochMs | null;
}

/**
 * The public world snapshot, broadcast to every client in the match.
 *
 * Contains no role information of any kind. Whatever a given player is uniquely
 * allowed to know arrives separately in GameSelfState, on their socket alone.
 */
export interface GameSnapshot {
  matchId: MatchId;
  map: MapId;
  phase: GamePhase;
  timer: PhaseTimer;
  players: PublicPlayerState[];
  bodies: DeadBody[];
  tasks: TeamTaskProgress;
  sabotage: SabotageState | null;
  meeting: MeetingState | null;
  /** Server clock at send time, so clients can correct for drift. */
  serverTime: EpochMs;
}

/**
 * High-frequency movement delta. Sent far more often than a full GameSnapshot,
 * and carries only what actually changes every tick.
 */
export interface MovementDelta {
  players: Array<Pick<PublicPlayerState, 'id' | 'position' | 'facing' | 'animation'>>;
  serverTime: EpochMs;
}

/** The private half of the state, delivered only to its owner. */
export interface GameSelfState {
  self: SelfPlayerState;
  tasks: TaskAssignment[];
}

/** Sent on reconnect: everything needed to rebuild the client from nothing. */
export interface GameResumeState {
  snapshot: GameSnapshot;
  self: GameSelfState;
  /** Chat the player missed, for channels they are entitled to read. */
  missedMessages: ChatMessage[];
}

export interface EliminationEvent {
  /**
   * SECURITY: the victim only. The killer's identity never appears in any
   * broadcast - deducing it is the entire game.
   */
  victimId: PlayerId;
  bodyId: string;
}

export interface BodyReportInput {
  bodyId: string;
}
