import type { AchievementId, PlayerRole, Team, WinReason } from '../constants/game';
import type { MapId } from '../constants/map';
import type { ISODateString } from './common';
import type { MatchId } from './game';
import type { PlayerId } from './player';
import type { RoomSettings } from './room';
import type { AvatarId, PublicUser, UserId } from './user';

/** One player's line on the results screen. Roles are public once a match ends. */
export interface MatchPlayerResult {
  userId: PlayerId;
  username: string;
  avatar: AvatarId;
  role: PlayerRole;
  survived: boolean;
  objectivesCompleted: number;
  eliminations: number;
  /** Server-computed. The client never submits an XP figure. */
  xpEarned: number;
  xpBreakdown: XpLineItem[];
  /** Achievements unlocked by this match. */
  unlocked: AchievementId[];
  levelBefore: number;
  levelAfter: number;
}

export interface XpLineItem {
  /** Matches a key of XP_AWARDS, or a derived label for repeated awards. */
  label: string;
  amount: number;
}

export interface MatchResult {
  matchId: MatchId;
  winner: Team;
  reason: WinReason;
  /** Seconds. */
  duration: number;
  players: MatchPlayerResult[];
  endedAt: ISODateString;
}

/** A row in a user's match history. */
export interface MatchSummary {
  id: MatchId;
  map: MapId;
  gameMode: RoomSettings['gameMode'];
  winner: Team;
  reason: WinReason;
  /** The requesting user's own role and outcome. */
  yourRole: PlayerRole;
  youWon: boolean;
  playerCount: number;
  duration: number;
  startedAt: ISODateString;
  endedAt: ISODateString;
}

/* ---------------------------------------------------------- leaderboard - */

export const LeaderboardScope = {
  WORLD: 'WORLD',
  FRIENDS: 'FRIENDS',
  /** Region-scoped, derived server-side. Never from a client-supplied location. */
  LOCALITY: 'LOCALITY',
} as const;
export type LeaderboardScope = (typeof LeaderboardScope)[keyof typeof LeaderboardScope];

/**
 * A leaderboard row. Carries PublicUser fields only - no email, no locality
 * string, nothing a scraper could use to profile a player.
 */
export interface LeaderboardEntry extends PublicUser {
  rank: number;
  wins: number;
  matchesPlayed: number;
}

export interface LeaderboardQuery {
  scope: LeaderboardScope;
  page?: number;
  limit?: number;
}

/** The requesting user's own position, returned alongside a page of rows. */
export interface LeaderboardViewerRank {
  userId: UserId;
  rank: number | null;
}
