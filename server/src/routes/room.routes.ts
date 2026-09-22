import { Router } from 'express';
import {
  closeRoom,
  createRoom,
  getRoom,
  joinRoom,
  previewRoom,
  updateRoom,
} from '../controllers/roomController';
import { requireAuth } from '../middleware/requireAuth';
import { validateBody, validateParams } from '../middleware/validate';
import {
  createRoomSchema,
  joinRoomSchema,
  roomCodeParamSchema,
  roomIdParamSchema,
  updateRoomSchema,
} from '../validation/roomSchemas';

/**
 * `/api/rooms`.
 *
 * Every route requires a session. Room codes are short and typeable, which
 * makes them guessable in bulk - requiring a signed-in caller means a scraper
 * needs an account, and an account can be disabled.
 *
 * Ordering matters: `/join` is declared before `/:code` so the literal path is
 * not swallowed by the parameter.
 */
export const roomRouter: Router = Router();

roomRouter.use(requireAuth);

roomRouter.post('/', validateBody(createRoomSchema), createRoom);
roomRouter.post('/join', validateBody(joinRoomSchema), joinRoom);

roomRouter.get('/code/:code', validateParams(roomCodeParamSchema), previewRoom);

roomRouter.get('/:id', validateParams(roomIdParamSchema), getRoom);
roomRouter.patch(
  '/:id',
  validateParams(roomIdParamSchema),
  validateBody(updateRoomSchema),
  updateRoom,
);
roomRouter.delete('/:id', validateParams(roomIdParamSchema), closeRoom);
