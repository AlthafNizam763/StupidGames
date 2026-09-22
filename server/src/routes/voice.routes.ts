import { Router } from 'express';
import { z } from 'zod';
import { getVoiceCapability, issueVoiceToken } from '../controllers/voiceController';
import { requireAuth } from '../middleware/requireAuth';
import { validateBody } from '../middleware/validate';

/**
 * `/api/voice`.
 *
 * The token body carries only the room the player is in. Channel and
 * permissions are derived server-side from match state (voice/permissions.ts),
 * so there is nothing here a client could ask for that it has not earned.
 */
export const voiceRouter: Router = Router();

voiceRouter.use(requireAuth);

voiceRouter.get('/capability', getVoiceCapability);
voiceRouter.post('/token', validateBody(z.object({ roomId: z.string().uuid() })), issueVoiceToken);
