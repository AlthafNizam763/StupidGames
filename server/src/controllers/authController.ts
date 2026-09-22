import type { Request, Response } from 'express';
import { config } from '../config/env';
import {
  REFRESH_COOKIE_NAME,
  clearRefreshCookie,
  durationToMs,
  setRefreshCookie,
} from '../lib/cookies';
import { created, ok, okEmpty } from '../lib/respond';
import { currentUser } from '../middleware/requireAuth';
import { authService, type SessionResult } from '../services/authService';

/**
 * Auth endpoints.
 *
 * Controllers stay thin: take validated input, call a service, shape the
 * response. The only thing they do that a service does not is set the refresh
 * cookie, because that is an HTTP concern and the service layer does not know
 * Express exists.
 */

function sendSession(res: Response, result: SessionResult, message: string, status = 200): void {
  setRefreshCookie(res, result.refreshToken, durationToMs(config.auth.refreshTokenTtl));

  // Only the session goes in the body. The refresh token is in the cookie and
  // must never appear here - putting it in the body would hand it straight back
  // to JavaScript, which is the whole thing httpOnly prevents.
  if (status === 201) {
    created(res, result.session, message);
  } else {
    ok(res, result.session, message);
  }
}

export async function register(req: Request, res: Response): Promise<void> {
  const result = await authService.register(req.body);
  sendSession(res, result, 'Account created.', 201);
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(req.body);
  sendSession(res, result, 'Signed in.');
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
  const result = await authService.refresh(token);
  sendSession(res, result, 'Session refreshed.');
}

export function logout(_req: Request, res: Response): void {
  /*
   * Clearing the cookie is the whole logout. The access token is not revoked -
   * it cannot be, being stateless - but it expires within fifteen minutes and
   * the client discards it on sign-out. Revoking it immediately would mean a
   * token blacklist, which trades a large amount of shared state for fifteen
   * minutes of exposure on a token the user has already stopped using.
   */
  clearRefreshCookie(res);
  okEmpty(res, 'Signed out.');
}

export async function me(req: Request, res: Response): Promise<void> {
  const { userId } = currentUser(req);
  ok(res, await authService.me(userId), 'OK');
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  await authService.forgotPassword(req.body);

  /*
   * Always the same answer, whether or not the address is registered. A
   * different message - or status, or response time - would turn this endpoint
   * into a way to test which emails have accounts (API.md).
   */
  okEmpty(res, 'If that address has an account, a reset link is on its way.');
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  await authService.resetPassword(req.body);
  // The cookie is cleared so any session on this device starts fresh with the
  // new password.
  clearRefreshCookie(res);
  okEmpty(res, 'Password updated. You can sign in now.');
}
