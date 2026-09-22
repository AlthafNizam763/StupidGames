import { Router } from 'express';
import { liveness, readiness } from '../controllers/healthController';
import { authRouter } from './auth.routes';

/**
 * Route wiring.
 *
 * Routes declare paths, middleware and a controller. They contain no logic -
 * that is the point of the layering in ARCHITECTURE.md, and the one rule most
 * worth defending as this file grows.
 */

/** Infrastructure endpoints. Mounted before rate limiting so probes are never throttled. */
export const healthRouter: Router = Router();
healthRouter.get('/', liveness);
healthRouter.get('/ready', readiness);

/**
 * The versioned API surface.
 *
 * Phase 5 mounts `/users` and `/profile`, Phase 6 `/rooms`, Phase 22
 * `/leaderboard`. Requests to anything unmounted fall through to the 404
 * handler, which returns the standard envelope rather than Express's HTML
 * error page.
 */
export const apiRouter: Router = Router();

apiRouter.use('/auth', authRouter);
