import { Router } from 'express';
import { LeaderboardScope } from '@voidline/shared';
import { z } from 'zod';
import { usernameSchema } from '../validation/authSchemas';
import {
  acceptFriend,
  blockPlayer,
  getLeaderboard,
  getMatches,
  listBlocked,
  listFriends,
  removeFriend,
  requestFriend,
  unblockPlayer,
} from '../controllers/socialController';
import { requireAuth } from '../middleware/requireAuth';
import { paginationSchema, validateBody, validateParams, validateQuery } from '../middleware/validate';

const objectId = z.string().regex(/^[a-f0-9]{24}$/i, 'That is not a valid player id.');

/**
 * A friend request names its target by id or by username, and must name one.
 *
 * Both on the one endpoint rather than a separate username lookup: a resolver
 * of its own would be a tidy way to enumerate which accounts exist, whereas
 * here an unknown name is indistinguishable from a disabled account or a
 * block, because the request path answers all three the same way.
 */
const friendTargetSchema = z
  .object({
    userId: objectId.optional(),
    username: usernameSchema.optional(),
  })
  .refine((value) => value.userId !== undefined || value.username !== undefined, {
    message: 'Name a player by id or username.',
  });

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

/*
 * Before the /:id routes. They cannot actually collide - /:id matches a single
 * segment - but a literal path belongs above a parameterised one regardless,
 * so that a later edit widening /:id does not quietly capture these.
 *
 * Only blocks this player placed are ever returned: see friendService.
 */
friendRouter.get('/blocked', listBlocked);
friendRouter.delete('/blocked/:id', validateParams(z.object({ id: objectId })), unblockPlayer);

friendRouter.post('/request', validateBody(friendTargetSchema), requestFriend);
friendRouter.post('/block', validateBody(z.object({ userId: objectId })), blockPlayer);
friendRouter.post('/:id/accept', validateParams(z.object({ id: objectId })), acceptFriend);
friendRouter.delete('/:id', validateParams(z.object({ id: objectId })), removeFriend);
