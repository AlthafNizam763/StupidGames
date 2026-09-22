import type {
  Friendship,
  LeaderboardEntry,
  LeaderboardScope,
  MatchSummary,
  Paginated,
} from '@voidline/shared';
import { http } from './http';

/** Leaderboard, match history and friends. */
export const socialApi = {
  leaderboard(
    scope: LeaderboardScope,
    page = 1,
    limit = 25,
  ): Promise<Paginated<LeaderboardEntry> & { viewerRank: number | null }> {
    return http.get('/api/leaderboard', { query: { scope, page, limit } });
  },

  matches(page = 1, limit = 25): Promise<Paginated<MatchSummary>> {
    return http.get('/api/matches', { query: { page, limit } });
  },

  friends(): Promise<Friendship[]> {
    return http.get<Friendship[]>('/api/friends');
  },

  /**
   * Sends a friend request, by id or by username.
   *
   * A union rather than two optional fields, so "exactly one of these" is the
   * type's problem rather than a runtime check - which is also how the endpoint
   * behaves: it refuses a body naming neither.
   *
   * A username that does not exist fails identically to a disabled account and
   * to somebody who has blocked you: 404, "No such player." That is deliberate
   * on the server, so error copy here must not try to distinguish them.
   */
  requestFriend(target: { userId: string } | { username: string }): Promise<Friendship> {
    return http.post<Friendship>('/api/friends/request', target);
  },

  acceptFriend(id: string): Promise<Friendship> {
    return http.post<Friendship>(`/api/friends/${id}/accept`);
  },

  removeFriend(id: string): Promise<null> {
    return http.delete<null>(`/api/friends/${id}`);
  },

  blockPlayer(userId: string): Promise<null> {
    return http.post<null>('/api/friends/block', { userId });
  },

  /**
   * Blocks this player placed. Never blocks placed on them.
   *
   * Excluded from `friends()`, which is why they need their own call. The
   * server does the filtering - a list of blocks made *against* the viewer
   * would tell them they had been blocked, so there is nothing to filter here
   * and nothing that should be added.
   */
  blocked(): Promise<Friendship[]> {
    return http.get<Friendship[]>('/api/friends/blocked');
  },

  /** Lifts a block. Only the player who placed it may; others get a 404. */
  unblockPlayer(id: string): Promise<null> {
    return http.delete<null>(`/api/friends/blocked/${id}`);
  },
};
