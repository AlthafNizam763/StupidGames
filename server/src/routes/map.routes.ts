import { Router } from 'express';
import { z } from 'zod';
import { getMapData } from '../controllers/mapController';
import { requireAuth } from '../middleware/requireAuth';
import { validateParams } from '../middleware/validate';

/**
 * `/api/maps`.
 *
 * Behind a session like everything else, so map data is not a public asset
 * anyone can scrape to build a cheat overlay. That is a speed bump rather than
 * a wall - any player can read it - but there is no reason to publish it.
 */
export const mapRouter: Router = Router();

mapRouter.get(
  '/:mapId',
  requireAuth,
  validateParams(z.object({ mapId: z.string().min(1).max(64) })),
  getMapData,
);
