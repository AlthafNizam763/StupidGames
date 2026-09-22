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

  requestFriend(userId: string): Promise<Friendship> {
    return http.post<Friendship>('/api/friends/request', { userId });
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
};
