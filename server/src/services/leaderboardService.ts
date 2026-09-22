import {
  LeaderboardScope,
  PAGINATION,
  type LeaderboardEntry,
  type Paginated,
} from '@voidline/shared';
import { FriendshipModel } from '../models/Friendship';
import { UserModel } from '../models/User';
import { toPublicUser } from '../repositories/UserRepository';

/**
 * Leaderboards (§32).
 *
 * Three scopes over one query shape. Rows carry `PublicUser` fields only - no
 * email, no locality string, nothing a scraper could use to profile a player
 * beyond what is already on their profile page.
 */

export interface LeaderboardPage extends Paginated<LeaderboardEntry> {
  /** Where the requesting player sits, or null if they are unranked. */
  viewerRank: number | null;
}

async function friendIdsOf(userId: string): Promise<string[]> {
  const relationships = await FriendshipModel.find({
    status: 'ACCEPTED',
    $or: [{ pairLow: userId }, { pairHigh: userId }],
  })
    .lean()
    .exec();

  return relationships.map((row) =>
    String(row.pairLow) === userId ? String(row.pairHigh) : String(row.pairLow),
  );
}

export const leaderboardService = {
  async page(
    viewerId: string,
    scope: LeaderboardScope,
    page: number,
    limit: number,
  ): Promise<LeaderboardPage> {
    const safeLimit = Math.min(Math.max(1, limit), PAGINATION.maxLimit);
    const safePage = Math.max(1, page);
    const skip = (safePage - 1) * safeLimit;

    /*
     * LOCALITY is deliberately not implemented as a client-supplied region.
     *
     * Accepting a location from the client would let anyone place themselves
     * in the smallest region they could find and top it. Deriving it properly
     * needs request geography the server does not collect yet, so for now it
     * falls back to the world board rather than pretending to be regional.
     */
    const filter: Record<string, unknown> = { disabled: false };

    if (scope === LeaderboardScope.FRIENDS) {
      const friends = await friendIdsOf(viewerId);
      // The viewer is always on their own friends board - a board that
      // excluded you gives you nothing to measure against.
      filter._id = { $in: [...friends, viewerId] };
    }

    const [docs, total] = await Promise.all([
      UserModel.find(filter).sort({ xp: -1, _id: 1 }).skip(skip).limit(safeLimit).exec(),
      UserModel.countDocuments(filter).exec(),
    ]);

    const items: LeaderboardEntry[] = docs.map((doc, index) => ({
      ...toPublicUser(doc),
      rank: skip + index + 1,
      wins: doc.stats.matchesWon,
      matchesPlayed: doc.stats.matchesPlayed,
    }));

    return {
      items,
      page: safePage,
      limit: safeLimit,
      total,
      hasMore: skip + items.length < total,
      viewerRank: await rankOf(viewerId, filter),
    };
  },
};

/**
 * A player's rank, by counting how many are above them.
 *
 * `countDocuments` on an indexed sort key rather than scanning a page: finding
 * rank 40,000 by paging to it would read forty thousand documents.
 */
async function rankOf(userId: string, filter: Record<string, unknown>): Promise<number | null> {
  const viewer = await UserModel.findById(userId).exec();
  if (!viewer) return null;

  const above = await UserModel.countDocuments({
    ...filter,
    $or: [{ xp: { $gt: viewer.xp } }, { xp: viewer.xp, _id: { $lt: viewer._id } }],
  }).exec();

  return above + 1;
}
