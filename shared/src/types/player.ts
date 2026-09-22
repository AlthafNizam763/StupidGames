import type { PlayerRole } from '../constants/game';
import type { CharacterAppearance } from '../constants/appearance';
import type { ZoneId } from '../constants/map';
import type { ConnectionState } from './room';
import type { EpochMs, Vec2 } from './common';
import type { AvatarId, UserId } from './user';

export type PlayerId = UserId;

export const Facing = {
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
} as const;
export type Facing = (typeof Facing)[keyof typeof Facing];

export const AnimationState = {
  IDLE: 'IDLE',
  WALK: 'WALK',
  INTERACT: 'INTERACT',
  DEAD: 'DEAD',
} as const;
export type AnimationState = (typeof AnimationState)[keyof typeof AnimationState];

/**
 * What every client in the match receives about every player.
 *
 * SECURITY: this interface has no `role` field, by design. Role is secret, so it
 * travels only in SelfPlayerState (to its owner) and in the Saboteur roster (to
 * Saboteurs only). If a role field is ever added here, every Operator learns
 * every role - so the omission is load-bearing, not an oversight.
 */
export interface PublicPlayerState {
  id: PlayerId;
  username: string;
  avatar: AvatarId;
  /** Public. Every client draws every player, Saboteur included. */
  appearance: CharacterAppearance;
  position: Vec2;
  facing: Facing;
  animation: AnimationState;
  alive: boolean;
  connection: ConnectionState;
  /**
   * Present only when the viewer is allowed to know it. The server omits it
   * while a comms sabotage is suppressing location data.
   */
  zone?: ZoneId;
}

/** The private slice a player receives about themselves, on their socket only. */
export interface SelfPlayerState extends PublicPlayerState {
  role: PlayerRole;
  /** Objective ids assigned to this player. Empty for Saboteurs. */
  taskIds: string[];
  /** Epoch ms at which elimination becomes available. Saboteurs only. */
  killCooldownEndsAt: EpochMs | null;
  /** Epoch ms at which sabotage becomes available. Saboteurs only. */
  sabotageCooldownEndsAt: EpochMs | null;
  emergencyMeetingsLeft: number;
  /** Fellow Saboteurs. Empty for Operators - they are never told who anyone is. */
  allyIds: PlayerId[];
}

/** A corpse left behind by an elimination. Reportable by any living player in range. */
export interface DeadBody {
  id: string;
  /** The eliminated player. The *killer* is never included in this payload. */
  playerId: PlayerId;
  position: Vec2;
  zone: ZoneId;
  reported: boolean;
}

/**
 * One frame of client input. This carries a direction, never a position - the
 * server integrates it, so there is no coordinate for a cheater to forge.
 */
export interface MovementInput {
  /** Monotonic per-socket counter. Replays and out-of-order packets are dropped. */
  sequence: number;
  /** Normalised direction. Magnitude above 1 is clamped server-side. */
  direction: Vec2;
  /** Client frame delta in ms. Clamped server-side; never trusted as-is. */
  deltaMs: number;
}

/**
 * Server correction. Sent only when the client's predicted position has drifted
 * beyond tolerance, so a well-behaved client rarely receives one.
 */
export interface MovementCorrection {
  /** The last input sequence this correction accounts for. */
  sequence: number;
  position: Vec2;
}
