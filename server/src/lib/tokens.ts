import { createHash, randomBytes } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { ErrorCode } from '@voidline/shared';
import { config } from '../config/env';
import { AppError } from './AppError';

/**
 * Token minting and verification.
 *
 * Two token types, two secrets, two lifetimes:
 *
 * - **Access**: short-lived (15m), sent as `Authorization: Bearer`, held in
 *   browser memory only. A stolen one expires on its own.
 * - **Refresh**: long-lived (30d), delivered as an httpOnly cookie so no
 *   JavaScript can read it - which is what stops an XSS bug from lifting a
 *   month-long credential.
 *
 * The secrets are distinct by design. With one shared secret, a refresh token
 * would verify as an access token and skip the whole rotation mechanism.
 */

export const TokenType = {
  ACCESS: 'access',
  REFRESH: 'refresh',
} as const;
export type TokenType = (typeof TokenType)[keyof typeof TokenType];

export interface AccessTokenPayload {
  sub: string;
  username: string;
  type: typeof TokenType.ACCESS;
}

export interface RefreshTokenPayload {
  sub: string;
  type: typeof TokenType.REFRESH;
  /**
   * The account's token version when this was minted.
   *
   * Compared on every refresh. A password reset bumps the account's counter and
   * every token issued before it stops being accepted - stateless revocation,
   * without the shared token store a blacklist would need.
   */
  ver: number;
}

const ISSUER = 'voidline';

function sign(payload: object, secret: string, expiresIn: string): string {
  const options = { expiresIn, issuer: ISSUER } as SignOptions;
  return jwt.sign(payload, secret, options);
}

export function signAccessToken(userId: string, username: string): string {
  const payload: AccessTokenPayload = { sub: userId, username, type: TokenType.ACCESS };
  return sign(payload, config.auth.jwtSecret, config.auth.accessTokenTtl);
}

export function signRefreshToken(userId: string, tokenVersion = 0): string {
  const payload: RefreshTokenPayload = { sub: userId, type: TokenType.REFRESH, ver: tokenVersion };
  return sign(payload, config.auth.jwtRefreshSecret, config.auth.refreshTokenTtl);
}

function verifyWith<T>(token: string, secret: string, expected: TokenType): T {
  let decoded: unknown;

  try {
    decoded = jwt.verify(token, secret, { issuer: ISSUER });
  } catch (error) {
    // Expiry is reported separately because the client acts on it: TOKEN_EXPIRED
    // means "refresh and retry once", TOKEN_INVALID means "sign in again".
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError(ErrorCode.TOKEN_EXPIRED);
    }
    throw new AppError(ErrorCode.TOKEN_INVALID);
  }

  if (typeof decoded !== 'object' || decoded === null) {
    throw new AppError(ErrorCode.TOKEN_INVALID);
  }

  /*
   * A valid signature is not enough: the token must also be the *kind* of token
   * this call site asked for. Without this check, anything signed with the same
   * secret would be accepted anywhere that secret is used.
   */
  if ((decoded as { type?: unknown }).type !== expected) {
    throw new AppError(ErrorCode.TOKEN_INVALID);
  }

  return decoded as T;
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return verifyWith<AccessTokenPayload>(token, config.auth.jwtSecret, TokenType.ACCESS);
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return verifyWith<RefreshTokenPayload>(token, config.auth.jwtRefreshSecret, TokenType.REFRESH);
}

/** Access token lifetime in seconds, for the client's expiry countdown. */
export function accessTokenTtlSeconds(): number {
  const decoded = jwt.decode(signAccessToken('probe', 'probe'));
  if (typeof decoded === 'object' && decoded && 'exp' in decoded && 'iat' in decoded) {
    return (decoded.exp as number) - (decoded.iat as number);
  }
  return 900;
}

/* ------------------------------------------------------- password resets - */

/**
 * A reset token is a random string, not a JWT.
 *
 * It must be revocable the instant it is used, and a stateless token cannot be.
 * The plaintext goes in the email; only its SHA-256 is stored, so a leaked
 * database dump contains nothing an attacker can present (SECURITY.md).
 *
 * SHA-256 rather than argon2 here is deliberate: this is a 256-bit random
 * value, not a human-chosen password, so there is no dictionary to slow down.
 */
export function createResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashResetToken(token) };
}

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
