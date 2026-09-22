import type { Request, Response } from 'express';
import { ok } from '../lib/respond';
import { currentUser } from '../middleware/requireAuth';
import { validated } from '../middleware/validate';
import { userService } from '../services/userService';
import type { UserIdParam } from '../validation/userSchemas';

export async function getMe(req: Request, res: Response): Promise<void> {
  const { userId } = currentUser(req);
  ok(res, await userService.getSelf(userId), 'OK');
}

export async function updateMe(req: Request, res: Response): Promise<void> {
  const { userId } = currentUser(req);
  ok(res, await userService.updateProfile(userId, req.body), 'Profile updated.');
}

export async function getProfile(_req: Request, res: Response): Promise<void> {
  // Read from the validated params, not `req.params`, so the id has already
  // been shape-checked.
  const { userId } = validated<UserIdParam>(res, 'params');
  ok(res, await userService.getProfile(userId), 'OK');
}
