import type { Request, Response } from 'express';
import { LeaderboardScope, type MatchSummary } from '@voidline/shared';
import { ok, okEmpty } from '../lib/respond';
import { currentUser } from '../middleware/requireAuth';
import { validated } from '../middleware/validate';
import { friendService } from '../services/friendService';
import { leaderboardService } from '../services/leaderboardService';
import { MatchModel } from '../models/Match';

/* --------------------------------------------------------- leaderboard - */

export async function getLeaderboard(req: Request, res: Response): Promise<void> {
  const { userId } = currentUser(req);
  const query = validated<{ scope: LeaderboardScope; page: number; limit: number }>(res, 'query');

  ok(res, await leaderboardService.page(userId, query.scope, query.page, query.limit), 'OK');
}

/* ------------------------------------------------------------- matches - */

/**
 * The caller's own match history.
 *
 * Filtered to matches they played in. A player cannot read somebody else's
 * history, which would otherwise reveal how often a specific person draws the
 * Saboteur role.
 */
export async function getMatches(req: Request, res: Response): Promise<void> {
  const { userId } = currentUser(req);
  const { page, limit } = validated<{ page: number; limit: number }>(res, 'query');
  const skip = (page - 1) * limit;

  const [docs, total] = await Promise.all([
    MatchModel.find({ 'players.userId': userId }).sort({ endedAt: -1 }).skip(skip).limit(limit).exec(),
    MatchModel.countDocuments({ 'players.userId': userId }).exec(),
  ]);

  const items: MatchSummary[] = docs.map((doc) => {
    const own = doc.players.find((player) => String(player.userId) === userId);

    return {
      id: doc.id as string,
      map: doc.map as MatchSummary['map'],
      gameMode: doc.gameMode as MatchSummary['gameMode'],
      winner: doc.winner as MatchSummary['winner'],
      reason: doc.reason as MatchSummary['reason'],
      yourRole: (own?.role ?? 'OPERATOR') as MatchSummary['yourRole'],
      youWon: own?.won ?? false,
      playerCount: doc.players.length,
      duration: doc.duration,
      startedAt: doc.startedAt.toISOString(),
      endedAt: doc.endedAt.toISOString(),
    };
  });

  ok(res, { items, page, limit, total, hasMore: skip + items.length < total }, 'OK');
}

/* ------------------------------------------------------------- friends - */

export async function listFriends(req: Request, res: Response): Promise<void> {
  const { userId } = currentUser(req);
  ok(res, await friendService.list(userId), 'OK');
}

/**
 * Sends a friend request, by id or by username.
 *
 * A person types a name; the client usually holds an id. Both are accepted on
 * the one endpoint rather than adding a lookup route, because a username
 * resolver of its own would be a clean way to enumerate which accounts exist.
 * Here the name never produces a distinguishable answer: an unknown username, a
 * disabled account and a block all fail the same way.
 */
export async function requestFriend(req: Request, res: Response): Promise<void> {
  const { userId } = currentUser(req);
  const body = req.body as { userId?: string; username?: string };

  const targetId =
    body.userId ?? (await friendService.findIdByUsername(body.username as string));

  ok(res, await friendService.request(userId, targetId), 'Request sent.');
}

export async function acceptFriend(req: Request, res: Response): Promise<void> {
  const { userId } = currentUser(req);
  const { id } = validated<{ id: string }>(res, 'params');
  ok(res, await friendService.accept(userId, id), 'Request accepted.');
}

export async function removeFriend(req: Request, res: Response): Promise<void> {
  const { userId } = currentUser(req);
  const { id } = validated<{ id: string }>(res, 'params');
  await friendService.remove(userId, id);
  okEmpty(res, 'Removed.');
}

export async function blockPlayer(req: Request, res: Response): Promise<void> {
  const { userId } = currentUser(req);
  await friendService.block(userId, req.body.userId);
  okEmpty(res, 'Blocked.');
}

/** Blocks this player placed. Never blocks placed on them - see the service. */
export async function listBlocked(req: Request, res: Response): Promise<void> {
  const { userId } = currentUser(req);
  ok(res, await friendService.listBlocked(userId), 'OK');
}

export async function unblockPlayer(req: Request, res: Response): Promise<void> {
  const { userId } = currentUser(req);
  const { id } = validated<{ id: string }>(res, 'params');
  await friendService.unblock(userId, id);
  okEmpty(res, 'Unblocked.');
}
