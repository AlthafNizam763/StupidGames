import type { PlayerRole } from '../constants/game';
import type { EpochMs } from './common';
import type { PlayerId } from './player';

export type MeetingId = string;

export const MeetingTrigger = {
  BODY_REPORT: 'BODY_REPORT',
  EMERGENCY: 'EMERGENCY',
} as const;
export type MeetingTrigger = (typeof MeetingTrigger)[keyof typeof MeetingTrigger];

/* ------------------------------------------------------------------ chat - */

export const ChatChannel = {
  /** Open during PLAYING, subject to game-mode rules. */
  PROXIMITY: 'PROXIMITY',
  /** Living players during a council. */
  COUNCIL: 'COUNCIL',
  /**
   * Eliminated players only. The server never delivers a DEAD message to a
   * living socket - this is enforced at fan-out, not by client filtering.
   */
  DEAD: 'DEAD',
  /** Saboteur-only coordination, where the game mode allows it. */
  SABOTEUR: 'SABOTEUR',
} as const;
export type ChatChannel = (typeof ChatChannel)[keyof typeof ChatChannel];

export interface ChatMessage {
  id: string;
  channel: ChatChannel;
  senderId: PlayerId;
  senderName: string;
  body: string;
  sentAt: EpochMs;
  /** True when the profanity filter rewrote the body. */
  filtered: boolean;
}

export interface ChatSendInput {
  channel: ChatChannel;
  body: string;
}

/* ---------------------------------------------------------------- voting - */

/** A vote target: a player id, or SKIP. */
export const SKIP_VOTE = 'SKIP';
export type VoteTarget = PlayerId | typeof SKIP_VOTE;

export interface VoteInput {
  meetingId: MeetingId;
  target: VoteTarget;
}

/**
 * A cast ballot as broadcast during voting.
 *
 * With anonymous voting on, the server sends `voterId` but omits `target` until
 * the tally - so clients can show "has voted" without leaking the choice. The
 * redaction happens server-side; the client is never sent a value to hide.
 */
export interface CastVote {
  voterId: PlayerId;
  target?: VoteTarget;
}

export interface VoteTally {
  target: VoteTarget;
  votes: number;
  /** Empty when the meeting used anonymous voting. */
  voterIds: PlayerId[];
}

export const VotingOutcome = {
  EJECTED: 'EJECTED',
  SKIPPED: 'SKIPPED',
  TIED: 'TIED',
  /** Timer expired with too few ballots cast to decide anything. */
  NO_QUORUM: 'NO_QUORUM',
} as const;
export type VotingOutcome = (typeof VotingOutcome)[keyof typeof VotingOutcome];

export interface VotingResult {
  meetingId: MeetingId;
  outcome: VotingOutcome;
  /** Set only when outcome is EJECTED. */
  ejectedId: PlayerId | null;
  ejectedName: string | null;
  /**
   * Revealed only when the room has confirmEjection enabled. Null otherwise -
   * and null because the server withheld it, not because the client hid it.
   */
  ejectedRole: PlayerRole | null;
  tallies: VoteTally[];
  /** Remaining Saboteur count, revealed only when the room setting allows it. */
  saboteursRemaining: number | null;
}

/* --------------------------------------------------------------- council - */

export interface MeetingState {
  id: MeetingId;
  trigger: MeetingTrigger;
  /** Who called it, or who reported the body. */
  calledById: PlayerId;
  calledByName: string;
  /** The eliminated player whose body was reported. Null for emergencies. */
  reportedPlayerId: PlayerId | null;
  reportedPlayerName: string | null;
  startedAt: EpochMs;
  /** Epoch ms at which discussion closes and voting opens. */
  discussionEndsAt: EpochMs;
  /** Epoch ms at which ballots close. Null until voting opens. */
  votingEndsAt: EpochMs | null;
  anonymous: boolean;
  /** Living players eligible to vote. */
  eligibleVoterIds: PlayerId[];
  votes: CastVote[];
}
