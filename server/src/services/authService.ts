import { randomBytes } from 'node:crypto';
import { ErrorCode, type AuthSession, type AuthTokens, type SelfUser } from '@voidline/shared';
import { config } from '../config/env';
import { AppError } from '../lib/AppError';
import { logger } from '../lib/logger';
import { hashPassword, verifyPassword } from '../lib/password';
import {
  accessTokenTtlSeconds,
  createResetToken,
  hashResetToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../lib/tokens';
import { passwordResetRepository } from '../repositories/PasswordResetRepository';
import { toSelfUser, userRepository } from '../repositories/UserRepository';
import type { UserDocument } from '../models/User';
import { mailService } from './mailService';
import type {
  ForgotPasswordBody,
  LoginBody,
  RegisterBody,
  ResetPasswordBody,
} from '../validation/authSchemas';

/**
 * Authentication rules.
 *
 * Framework-free on purpose: nothing here imports Express, so every rule below
 * is testable against a real database without an HTTP server.
 *
 * The recurring theme is *not leaking which accounts exist*. A sign-in failure,
 * a reset request for an unknown address and a spent reset link all have to be
 * indistinguishable from the outside, or the endpoint becomes a way to
 * enumerate players.
 */

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // one hour

/**
 * A real argon2id hash of a random string, used to equalise sign-in timing for
 * addresses that do not exist.
 *
 * It has to be a genuine hash: a malformed one would fail argon2's parser
 * immediately instead of doing the work, which would leave exactly the timing
 * difference this exists to remove. Computed once, lazily, so startup does not
 * pay for it.
 */
let timingDummyHash: string | null = null;

async function dummyVerify(password: string): Promise<void> {
  timingDummyHash ??= await hashPassword(randomBytes(32).toString('hex'));
  await verifyPassword(timingDummyHash, password);
}

export interface SessionResult {
  session: AuthSession;
  /** Set as an httpOnly cookie by the controller. Never in the response body. */
  refreshToken: string;
}

function issueSession(user: UserDocument): SessionResult {
  const self: SelfUser = toSelfUser(user);
  const tokens: AuthTokens = {
    accessToken: signAccessToken(user.id as string, user.username),
    expiresIn: accessTokenTtlSeconds(),
  };

  return {
    session: { ...tokens, user: self },
    refreshToken: signRefreshToken(user.id as string, user.tokenVersion ?? 0),
  };
}

export const authService = {
  async register(input: RegisterBody): Promise<SessionResult> {
    /*
     * Checked before inserting so the user gets a field-level error rather than
     * a duplicate-key failure. This is a convenience, not the guarantee: two
     * simultaneous registrations can both pass this check, and the unique
     * indexes are what actually prevent the duplicate. The error handler
     * translates code 11000 into the same USERNAME_TAKEN / EMAIL_TAKEN.
     */
    const [existingEmail, existingUsername] = await Promise.all([
      userRepository.findByEmail(input.email),
      userRepository.findByUsername(input.username),
    ]);

    if (existingEmail) throw new AppError(ErrorCode.EMAIL_TAKEN);
    if (existingUsername) throw new AppError(ErrorCode.USERNAME_TAKEN);

    const user = await userRepository.create({
      username: input.username,
      email: input.email,
      passwordHash: await hashPassword(input.password),
    });

    logger.info({ userId: user.id, username: user.username }, 'account registered');
    return issueSession(user);
  },

  async login(input: LoginBody): Promise<SessionResult> {
    const user = await userRepository.findByEmailWithPassword(input.email);

    /*
     * A missing account and a wrong password must be indistinguishable, in the
     * response *and* in the time taken. Returning early on a missing account
     * would skip the hash verification and answer measurably faster, which is
     * enough to enumerate registered addresses - so a dummy verification runs
     * in that case to keep the timing comparable.
     */
    if (!user) {
      await dummyVerify(input.password);
      throw new AppError(ErrorCode.INVALID_CREDENTIALS);
    }

    const correct = await verifyPassword(user.passwordHash, input.password);
    if (!correct) throw new AppError(ErrorCode.INVALID_CREDENTIALS);

    // Checked after the password, so a disabled account cannot be identified
    // without already knowing its credentials.
    if (user.disabled) throw new AppError(ErrorCode.ACCOUNT_DISABLED);

    logger.info({ userId: user.id }, 'signed in');
    return issueSession(user);
  },

  /**
   * Exchanges a refresh token for a new access token, and issues a fresh
   * refresh token alongside it.
   *
   * Revocation, precisely:
   *
   * - **Bulk revocation works.** Every token carries the account's
   *   `tokenVersion`, and a password reset bumps it, so every session opened
   *   with the old password dies at once. That is the case that matters: you
   *   reset because the password was stolen.
   * - **Per-token revocation does not.** The previous refresh token stays valid
   *   until it expires or the version changes. Invalidating one specific token,
   *   and the reuse detection that enables, needs a server-side token store
   *   this deliberately does not have.
   *
   * The account is re-read on every refresh rather than trusted from the token.
   * A player disabled ten minutes ago must not keep minting access tokens for
   * the next thirty days on the strength of a cookie issued before the ban.
   */
  async refresh(refreshToken: string | undefined): Promise<SessionResult> {
    if (!refreshToken) throw new AppError(ErrorCode.UNAUTHENTICATED);

    const payload = verifyRefreshToken(refreshToken);
    const user = await userRepository.findById(payload.sub);

    if (!user) throw new AppError(ErrorCode.TOKEN_INVALID);
    if (user.disabled) throw new AppError(ErrorCode.ACCOUNT_DISABLED);

    /*
     * Stateless revocation.
     *
     * A password reset bumps the account's counter, so every refresh token
     * minted before it fails here. Without this, somebody who reset their
     * password because it was stolen would still have the thief holding a
     * thirty-day session.
     */
    if ((payload.ver ?? 0) !== (user.tokenVersion ?? 0)) {
      throw new AppError(ErrorCode.TOKEN_INVALID, 'Your session ended when the password changed.');
    }

    return issueSession(user);
  },

  async me(userId: string): Promise<SelfUser> {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError(ErrorCode.TOKEN_INVALID);
    return toSelfUser(user);
  },

  /**
   * Starts a password reset.
   *
   * Returns nothing and throws nothing for an unknown address. The endpoint
   * answers identically either way, because a differing response - or a
   * differing status code - is an account-enumeration oracle (API.md).
   */
  async forgotPassword(input: ForgotPasswordBody): Promise<void> {
    const user = await userRepository.findByEmail(input.email);

    if (!user) {
      logger.info({ email: input.email }, 'password reset requested for unknown address');
      return;
    }

    const { token, tokenHash } = createResetToken();
    await passwordResetRepository.create(
      user.id as string,
      tokenHash,
      new Date(Date.now() + RESET_TOKEN_TTL_MS),
    );

    const resetUrl = `${config.webAppUrl}/reset-password?token=${encodeURIComponent(token)}`;
    await mailService.sendPasswordReset(user.email, user.username, resetUrl);

    logger.info({ userId: user.id }, 'password reset email dispatched');
  },

  /**
   * Completes a password reset.
   *
   * Every failure - unknown token, spent token, expired token, deleted account
   * - returns the same RESET_TOKEN_INVALID, so a caller cannot probe which
   * tokens ever existed.
   */
  async resetPassword(input: ResetPasswordBody): Promise<void> {
    const record = await passwordResetRepository.findByTokenHash(hashResetToken(input.token));

    if (!record) throw new AppError(ErrorCode.RESET_TOKEN_INVALID);
    if (record.usedAt) throw new AppError(ErrorCode.RESET_TOKEN_INVALID);
    // Checked here as well as by the TTL index: that monitor runs roughly once
    // a minute, so an expired document can briefly still exist.
    if (record.expiresAt.getTime() < Date.now()) {
      throw new AppError(ErrorCode.RESET_TOKEN_INVALID);
    }

    const user = await userRepository.findById(record.userId.toString());
    if (!user) throw new AppError(ErrorCode.RESET_TOKEN_INVALID);

    user.passwordHash = await hashPassword(input.password);
    // Ends every session opened with the old password, everywhere.
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await user.save();

    await passwordResetRepository.markUsed(record.id as string);
    // Any other outstanding link for this account dies with this reset.
    await passwordResetRepository.invalidateAllForUser(user.id as string);

    logger.info({ userId: user.id }, 'password reset completed');
  },
};

export type AuthService = typeof authService;
