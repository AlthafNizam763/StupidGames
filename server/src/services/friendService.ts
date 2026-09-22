import { ErrorCode, FriendshipStatus, type Friendship } from '@voidline/shared';
import { AppError } from '../lib/AppError';
import { logger } from '../lib/logger';
import { FriendshipModel, canonicalPair, type FriendshipDocument } from '../models/Friendship';
import { toPublicUser, userRepository } from '../repositories/UserRepository';

/**
 * Friends (§31 social architecture).
 *
 * The recurring concern is that a social graph is a way to find people. Every
 * operation here requires knowing a player's id, which you get from having
 * played with them or from their profile - there is no directory to enumerate,
 * and a request tells the recipient nothing they could not already see.
 */

async function hydrate(row: FriendshipDocument, viewerId: string): Promise<Friendship | null> {
  const otherId =
    String(row.pairLow) === viewerId ? String(row.pairHigh) : String(row.pairLow);

  const other = await userRepository.findById(otherId);
  // Their account was deleted or disabled. Dropped from the list rather than
  // rendered as a broken row.
  if (!other || other.disabled) return null;

  return {
    id: row.id as string,
    user: toPublicUser(other),
    status: row.status as FriendshipStatus,
    // Incoming means *they* asked and it is waiting on the viewer.
    incoming: String(row.requesterId) !== viewerId,
    createdAt: row.createdAt.toISOString(),
  };
}

export const friendService = {
  /** Every relationship this player is part of, accepted or pending. */
  async list(userId: string): Promise<Friendship[]> {
    const rows = await FriendshipModel.find({
      status: { $ne: 'BLOCKED' },
      $or: [{ pairLow: userId }, { pairHigh: userId }],
    })
      .sort({ updatedAt: -1 })
      .exec();

    const hydrated = await Promise.all(rows.map((row) => hydrate(row, userId)));
    return hydrated.filter((entry): entry is Friendship => entry !== null);
  },

  /**
   * Sends a request, or accepts one that is already waiting.
   *
   * Requesting somebody who has already requested you is the same gesture as
   * accepting - making a player find the other button to complete a mutual
   * request would be pedantry.
   */
  async request(userId: string, targetId: string): Promise<Friendship> {
    if (userId === targetId) {
      throw new AppError(ErrorCode.TARGET_INVALID, 'You cannot add yourself.');
    }

    const target = await userRepository.findById(targetId);
    // A disabled account reads as not found here too, so the endpoint cannot be
    // used to confirm a ban.
    if (!target || target.disabled) throw new AppError(ErrorCode.NOT_FOUND, 'No such player.');

    const pair = canonicalPair(userId, targetId);
    const existing = await FriendshipModel.findOne(pair).exec();

    if (existing) {
      if (existing.status === 'BLOCKED') {
        // Deliberately the same error as a missing player: revealing a block
        // would tell the blocked person they were blocked.
        throw new AppError(ErrorCode.NOT_FOUND, 'No such player.');
      }

      if (existing.status === 'ACCEPTED') {
        const hydrated = await hydrate(existing, userId);
        if (!hydrated) throw new AppError(ErrorCode.NOT_FOUND, 'No such player.');
        return hydrated;
      }

      // Pending. If they asked first, this is an acceptance.
      if (String(existing.requesterId) !== userId) {
        existing.status = 'ACCEPTED';
        await existing.save();
      }

      const hydrated = await hydrate(existing, userId);
      if (!hydrated) throw new AppError(ErrorCode.NOT_FOUND, 'No such player.');
      return hydrated;
    }

    const created = await FriendshipModel.create({
      ...pair,
      requesterId: userId,
      status: 'PENDING',
    });

    logger.info({ userId, targetId }, 'friend request sent');

    const hydrated = await hydrate(created, userId);
    if (!hydrated) throw new AppError(ErrorCode.NOT_FOUND, 'No such player.');
    return hydrated;
  },

  /** Accepts a pending request. Only the recipient may. */
  async accept(userId: string, friendshipId: string): Promise<Friendship> {
    const row = await FriendshipModel.findById(friendshipId).exec();
    if (!row) throw new AppError(ErrorCode.NOT_FOUND, 'No such request.');

    const isParticipant =
      String(row.pairLow) === userId || String(row.pairHigh) === userId;
    // Not a participant: reported as missing, so the endpoint cannot be used to
    // probe which friendship ids exist.
    if (!isParticipant) throw new AppError(ErrorCode.NOT_FOUND, 'No such request.');

    if (String(row.requesterId) === userId) {
      throw new AppError(ErrorCode.TARGET_INVALID, 'You cannot accept your own request.');
    }

    row.status = 'ACCEPTED';
    await row.save();

    const hydrated = await hydrate(row, userId);
    if (!hydrated) throw new AppError(ErrorCode.NOT_FOUND, 'No such player.');
    return hydrated;
  },

  /**
   * Removes a friendship, declines a request, or withdraws one.
   *
   * All three are the same operation from the data's point of view, and giving
   * them separate endpoints would mean three ways to get the authorisation
   * check wrong instead of one.
   */
  async remove(userId: string, friendshipId: string): Promise<void> {
    const row = await FriendshipModel.findById(friendshipId).exec();
    if (!row) return;

    const isParticipant =
      String(row.pairLow) === userId || String(row.pairHigh) === userId;
    if (!isParticipant) throw new AppError(ErrorCode.NOT_FOUND, 'No such request.');

    await FriendshipModel.deleteOne({ _id: row._id }).exec();
  },

  /**
   * Blocks a player.
   *
   * Kept as a row rather than a deletion, so a blocked person cannot simply
   * re-request. The block is invisible to them: every path they could use to
   * detect it answers "no such player" instead.
   */
  async block(userId: string, targetId: string): Promise<void> {
    if (userId === targetId) {
      throw new AppError(ErrorCode.TARGET_INVALID, 'You cannot block yourself.');
    }

    const pair = canonicalPair(userId, targetId);
    await FriendshipModel.findOneAndUpdate(
      pair,
      { ...pair, status: 'BLOCKED', blockedById: userId, requesterId: userId },
      { upsert: true, new: true },
    ).exec();

    logger.info({ userId, targetId }, 'player blocked');
  },
};
