import type { CookieOptions, Response } from 'express';
import { config } from '../config/env';

/**
 * The refresh cookie.
 *
 * Why a cookie rather than the response body: the refresh token is the
 * long-lived credential. Held in JavaScript it is readable by any script on the
 * page, so a single XSS bug yields a thirty-day session. As an httpOnly cookie
 * it is unreadable by script and travels automatically (SECURITY.md).
 *
 * The access token goes the other way - in the body, held in memory - because
 * it is short-lived and needs to be attached to an Authorization header.
 */

export const REFRESH_COOKIE_NAME = 'voidline_refresh';

function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    // Secure requires HTTPS, which development over localhost does not have.
    secure: config.isProduction,
    /*
     * `lax` is enough here and safer than `none`: the cookie is only ever sent
     * by our own fetch calls with `credentials: 'include'`, never by a
     * cross-site form post, so CSRF has nothing to ride on.
     *
     * If the client and API are ever served from genuinely different sites in
     * production, this has to become `none` - and `none` requires `secure`.
     */
    sameSite: 'lax',
    // Scoped to the refresh endpoint would be tighter, but the client also
    // clears it via /logout, so it has to be readable there too.
    path: '/api/auth',
  };
}

export function setRefreshCookie(res: Response, token: string, maxAgeMs: number): void {
  res.cookie(REFRESH_COOKIE_NAME, token, { ...cookieOptions(), maxAge: maxAgeMs });
}

/**
 * Clears the cookie.
 *
 * The attributes must match those it was set with, or the browser treats it as
 * a different cookie and silently keeps the original - a logout that does not
 * log out.
 */
export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, cookieOptions());
}

/** Parses a duration like `30d`, `15m`, `900s` into milliseconds. */
export function durationToMs(duration: string): number {
  const match = /^(\d+)([smhd])$/.exec(duration.trim());
  if (!match) return 30 * 24 * 60 * 60 * 1000;

  const value = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return value * (multipliers[unit as string] ?? 1000);
}
