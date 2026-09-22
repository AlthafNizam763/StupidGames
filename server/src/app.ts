import cors, { type CorsOptions } from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { config } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { generalLimiter } from './middleware/rateLimit';
import { httpLogger, requestId } from './middleware/requestContext';
import { rejectMongoOperators } from './middleware/sanitize';
import { apiRouter, healthRouter } from './routes';

/**
 * Builds the Express application.
 *
 * Separated from the process bootstrap in `index.ts` so tests can exercise the
 * app without opening a port or connecting to a database.
 *
 * Middleware order is deliberate and worth preserving:
 *
 *   id -> logging -> security headers -> CORS -> body parsing -> injection
 *   guard -> health -> rate limit -> routes -> 404 -> errors
 *
 * The correlation id comes first so every later log line carries it. Health
 * sits before the rate limiter so a platform probe is never throttled. The
 * error handler is last, because Express only recognises a four-argument
 * handler registered after everything it is meant to catch.
 */
export function createApp(): Express {
  const app = express();

  /*
   * Render, Railway and Fly all sit behind a proxy, so `req.ip` is the proxy's
   * address unless Express is told to read X-Forwarded-For. Without this the
   * rate limiter buckets every player in the world into one counter.
   *
   * `1` trusts exactly one hop - the platform's own proxy. Trusting `true`
   * would let a client forge X-Forwarded-For and escape rate limiting entirely.
   */
  app.set('trust proxy', 1);

  // Do not advertise the framework.
  app.disable('x-powered-by');

  app.use(requestId);
  app.use(httpLogger);

  app.use(
    helmet({
      /*
       * The web client is served from a different origin to this API, so the
       * default `same-origin` resource policy would make the browser discard
       * every response it fetches. CORS decides who may call us; CORP must be
       * permissive or CORS never gets the chance.
       */
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const corsOptions: CorsOptions = {
    origin(origin, callback) {
      // No Origin header: same-origin navigation, curl, a health probe. These
      // are not browser cross-origin requests, so there is nothing to refuse.
      if (!origin) {
        callback(null, true);
        return;
      }
      const allowed = config.corsOrigins.includes(origin.replace(/\/$/, ''));
      callback(null, allowed);
    },
    // Required for the httpOnly refresh cookie (Phase 4).
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Request-Id'],
  };
  app.use(cors(corsOptions));

  // A body limit is a denial-of-service control, not a formality. Nothing this
  // API accepts is anywhere near 100kb.
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  app.use(rejectMongoOperators);

  app.use('/health', healthRouter);

  app.use('/api', generalLimiter, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
