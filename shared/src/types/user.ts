import type { AchievementId } from '../constants/game';
import type { ISODateString } from './common';

export type UserId = string;

/** Avatar is a server-validated preset id, never a client-supplied URL. */
export type AvatarId = string;

/**
 * What any other player is allowed to see. Anything absent from this interface
 * - email above all - must never reach another player's client.
 */
export interface PublicUser {
  id: UserId;
  username: string;
  avatar: AvatarId;
  level: number;
  xp: number;
}

export interface UserStats {
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  operatorWins: number;
  saboteurWins: number;
  eliminations: number;
  objectivesCompleted: number;
  /** 0-1. Derived server-side so every surface agrees on the rounding. */
  winRate: number;
}

export interface UnlockedAchievement {
  id: AchievementId;
  unlockedAt: ISODateString;
}

/** A user's own account view. Returned only to that user. */
export interface SelfUser extends PublicUser {
  email: string;
  stats: UserStats;
  achievements: UnlockedAchievement[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Another user's profile page view. No email, no private fields. */
export interface UserProfile extends PublicUser {
  stats: UserStats;
  achievements: UnlockedAchievement[];
  createdAt: ISODateString;
}

/* ------------------------------------------------------------------ auth - */

export interface AuthTokens {
  accessToken: string;
  /** Seconds until accessToken expires. */
  expiresIn: number;
}

export interface AuthSession extends AuthTokens {
  user: SelfUser;
}

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface ResetPasswordInput {
  token: string;
  password: string;
}

/* ---------------------------------------------------------------- social - */

export const FriendshipStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  BLOCKED: 'BLOCKED',
} as const;
export type FriendshipStatus = (typeof FriendshipStatus)[keyof typeof FriendshipStatus];

export interface Friendship {
  id: string;
  user: PublicUser;
  status: FriendshipStatus;
  /** True when the *other* user sent the request and it is awaiting this user. */
  incoming: boolean;
  createdAt: ISODateString;
}
