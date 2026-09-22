import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import pinoHttp from 'pino-http';
import { logger } from '../lib/logger';

/**
 * Correlation id.
 *
 * Every request gets one, it is echoed in the response header, and it is the
 * only internal detail a failing response exposes (see the error handler). A
 * player reporting "it said reference 3f2a..." is then one log query away from
 * the actual stack trace, without that stack trace ever leaving the server.
 */
declare module 'express-serve-static-core' {
  interface Request {
    id: string;
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  req.id = randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as Request).id,
  // Successful traffic at debug keeps the development console readable; the
  // interesting lines - 4xx and 5xx - still stand out.
  customLogLevel(_req, res, err) {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'debug';
  },
  customSuccessMessage(req, res) {
    return `${req.method} ${req.url} ${res.statusCode}`;
  },
});
