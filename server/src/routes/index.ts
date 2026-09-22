import { Router } from 'express';
import { liveness, readiness } from '../controllers/healthController';
import { authRouter } from './auth.routes';
import { profileRouter, userRouter } from './user.routes';
import { roomRouter } from './room.routes';
import { mapRouter } from './map.routes';
import { friendRouter, leaderboardRouter, matchRouter } from './social.routes';
import { voiceRouter } from './voice.routes';

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
 * Phase 22
 * `/leaderboard`. Requests to anything unmounted fall through to the 404
 * handler, which returns the standard envelope rather than Express's HTML
 * error page.
 */
export const apiRouter: Router = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/profile', profileRouter);
apiRouter.use('/rooms', roomRouter);
apiRouter.use('/maps', mapRouter);
apiRouter.use('/leaderboard', leaderboardRouter);
apiRouter.use('/matches', matchRouter);
apiRouter.use('/friends', friendRouter);
apiRouter.use('/voice', voiceRouter);
