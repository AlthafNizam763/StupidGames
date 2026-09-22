import type { NextFunction, Request, Response } from 'express';
import { ErrorCode } from '@voidline/shared';
import { AppError } from '../lib/AppError';
import { verifyAccessToken } from '../lib/tokens';

/**
 * Bearer token authentication.
 *
 * Establishes *who is calling*, and nothing else. Whether that caller may
 * perform the action is a separate question, answered by the service that owns
 * the rule - being signed in is never by itself permission to do something.
 *
 * The identity lands on `req.auth` and every handler downstream reads it from
 * there. A `userId` in a request body is ignored, always: that is the field an
 * attacker controls.
 */

export interface AuthContext {
  userId: string;
  username: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    auth?: AuthContext;
  }
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const token = extractBearer(req.headers.authorization);

  if (!token) {
    next(new AppError(ErrorCode.UNAUTHENTICATED));
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.auth = { userId: payload.sub, username: payload.username };
    next();
  } catch (error) {
    // verifyAccessToken already distinguishes expired from invalid, and the
    // client acts on that difference: expired means refresh and retry once.
    next(error);
  }
}

/**
 * Reads the authenticated caller.
 *
 * Throws rather than returning null, because reaching a handler without
 * `requireAuth` in front of it is a wiring mistake, not a runtime condition to
 * branch on. Failing loudly here is what stops a protected route from quietly
 * serving unauthenticated requests.
 */
export function currentUser(req: Request): AuthContext {
  if (!req.auth) {
    throw new AppError(ErrorCode.UNAUTHENTICATED, undefined, {
      context: { reason: 'requireAuth middleware missing on this route', path: req.originalUrl },
    });
  }
  return req.auth;
}
