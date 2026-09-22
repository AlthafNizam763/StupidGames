import { Router } from 'express';
import { LeaderboardScope } from '@voidline/shared';
import { z } from 'zod';
import {
  acceptFriend,
  blockPlayer,
  getLeaderboard,
  getMatches,
  listFriends,
  removeFriend,
  requestFriend,
} from '../controllers/socialController';
import { requireAuth } from '../middleware/requireAuth';
import { paginationSchema, validateBody, validateParams, validateQuery } from '../middleware/validate';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'That is not a valid player id.');

export const leaderboardRouter: Router = Router();

leaderboardRouter.get(
  '/',
  requireAuth,
  validateQuery(
    paginationSchema.extend({
      scope: z
        .enum([LeaderboardScope.WORLD, LeaderboardScope.FRIENDS, LeaderboardScope.LOCALITY])
        .default(LeaderboardScope.WORLD),
    }),
  ),
  getLeaderboard,
);

export const matchRouter: Router = Router();

matchRouter.get('/', requireAuth, validateQuery(paginationSchema), getMatches);

export const friendRouter: Router = Router();

friendRouter.use(requireAuth);

friendRouter.get('/', listFriends);
friendRouter.post('/request', validateBody(z.object({ userId: objectId })), requestFriend);
friendRouter.post('/block', validateBody(z.object({ userId: objectId })), blockPlayer);
friendRouter.post('/:id/accept', validateParams(z.object({ id: objectId })), acceptFriend);
friendRouter.delete('/:id', validateParams(z.object({ id: objectId })), removeFriend);
