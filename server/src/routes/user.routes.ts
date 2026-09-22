import { Router } from 'express';
import { getMe, getProfile, updateMe } from '../controllers/userController';
import { requireAuth } from '../middleware/requireAuth';
import { validateBody, validateParams } from '../middleware/validate';
import { updateProfileSchema, userIdParamSchema } from '../validation/userSchemas';

/** `/api/users` - the caller's own account. */
export const userRouter: Router = Router();

userRouter.get('/me', requireAuth, getMe);
userRouter.patch('/me', requireAuth, validateBody(updateProfileSchema), updateMe);

/**
 * `/api/profile` - another player's public profile.
 *
 * Requires a session: profiles are visible to players, not to the open
 * internet, which keeps this from becoming a scrapeable directory.
 */
export const profileRouter: Router = Router();

profileRouter.get('/:userId', requireAuth, validateParams(userIdParamSchema), getProfile);
