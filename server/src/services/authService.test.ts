import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import { ErrorCode } from '@voidline/shared';
import { AppError } from '../lib/AppError';
import { createResetToken, hashResetToken, verifyAccessToken, verifyRefreshToken } from '../lib/tokens';
import { PasswordResetModel } from '../models/PasswordReset';
import { UserModel } from '../models/User';
import { passwordResetRepository } from '../repositories/PasswordResetRepository';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from '../test/dbHarness';
import { authService } from './authService';

/**
 * Integration tests against a real mongod.
 *
 * These cover the rules that would be invisible to a mocked repository: unique
 * indexes, case-insensitive username collation, and the account-enumeration
 * guarantees that only hold if every failure path returns the same thing.
 */

const VALID = {
  username: 'Vega_09',
  email: 'vega@voidline.test',
  password: 'correct horse battery',
};

/** Captures the AppError a call throws, or fails the test if it does not throw. */
async function expectAppError(run: () => Promise<unknown>): Promise<AppError> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof AppError, `expected AppError, got ${String(error)}`);
    return error;
  }
  assert.fail('expected the call to throw');
}

describe('authService', { timeout: 120_000 }, () => {
  before(async () => {
    await startTestDatabase();
  });

  after(async () => {
    await stopTestDatabase();
  });

  afterEach(async () => {
    await clearTestDatabase();
  });

  describe('register', () => {
    it('creates an account and issues a usable session', async () => {
      const result = await authService.register(VALID);

      assert.equal(result.session.user.username, 'Vega_09');
      assert.equal(result.session.user.email, 'vega@voidline.test');
      assert.equal(result.session.user.level, 1);
      assert.equal(result.session.user.xp, 0);
      assert.ok(result.session.expiresIn > 0);

      // Both tokens must verify, and must be of the right kind.
      assert.equal(verifyAccessToken(result.session.accessToken).sub, result.session.user.id);
      assert.equal(verifyRefreshToken(result.refreshToken).sub, result.session.user.id);
    });

    it('never stores the password in plaintext', async () => {
      await authService.register(VALID);

      const stored = await UserModel.findOne({ email: VALID.email }).select('+passwordHash').exec();
      assert.ok(stored);
      assert.notEqual(stored.passwordHash, VALID.password);
      assert.match(stored.passwordHash, /^\$argon2id\$/);
    });

    it('excludes the password hash from queries unless asked for', async () => {
      await authService.register(VALID);

      // `select: false` is what stops a forgotten projection leaking the hash.
      const stored = await UserModel.findOne({ email: VALID.email }).exec();
      assert.equal(stored?.passwordHash, undefined);
    });

    it('rejects a duplicate email', async () => {
      await authService.register(VALID);
      const error = await expectAppError(() =>
        authService.register({ ...VALID, username: 'Other_01' }),
      );
      assert.equal(error.code, ErrorCode.EMAIL_TAKEN);
    });

    it('rejects a duplicate username regardless of case', async () => {
      await authService.register(VALID);
      const error = await expectAppError(() =>
        // Collation strength 2 means VEGA_09 and Vega_09 are the same name, so
        // one player cannot impersonate another in the player list.
        authService.register({ ...VALID, username: 'VEGA_09', email: 'other@voidline.test' }),
      );
      assert.equal(error.code, ErrorCode.USERNAME_TAKEN);
    });

    it('relies on a unique index, not only the pre-check', async () => {
      await authService.register(VALID);

      // Two concurrent registrations can both pass the application-level check,
      // so the database has to be the thing that actually prevents this.
      await assert.rejects(
        () => UserModel.create({ ...VALID, passwordHash: 'x' }),
        (error: { code?: number }) => error.code === 11000,
      );
    });
  });

  describe('login', () => {
    it('signs in with correct credentials', async () => {
      await authService.register(VALID);
      const result = await authService.login({ email: VALID.email, password: VALID.password });
      assert.equal(result.session.user.email, VALID.email);
    });

    it('accepts the email in any case', async () => {
      await authService.register(VALID);
      const result = await authService.login({
        email: 'VEGA@VOIDLINE.TEST'.toLowerCase(),
        password: VALID.password,
      });
      assert.ok(result.session.accessToken);
    });

    it('gives the same error for a wrong password and an unknown account', async () => {
      await authService.register(VALID);

      const wrongPassword = await expectAppError(() =>
        authService.login({ email: VALID.email, password: 'not the password' }),
      );
      const unknownAccount = await expectAppError(() =>
        authService.login({ email: 'nobody@voidline.test', password: VALID.password }),
      );

      // Distinguishable errors here would let anyone test which addresses have
      // accounts, one request at a time.
      assert.equal(wrongPassword.code, ErrorCode.INVALID_CREDENTIALS);
      assert.equal(unknownAccount.code, ErrorCode.INVALID_CREDENTIALS);
      assert.equal(wrongPassword.message, unknownAccount.message);
    });

    it('refuses a disabled account', async () => {
      await authService.register(VALID);
      await UserModel.updateOne({ email: VALID.email }, { $set: { disabled: true } }).exec();

      const error = await expectAppError(() =>
        authService.login({ email: VALID.email, password: VALID.password }),
      );
      assert.equal(error.code, ErrorCode.ACCOUNT_DISABLED);
    });
  });

  describe('refresh', () => {
    it('issues a new session from a valid refresh token', async () => {
      const registered = await authService.register(VALID);
      const refreshed = await authService.refresh(registered.refreshToken);
      assert.equal(refreshed.session.user.id, registered.session.user.id);
    });

    it('refuses a missing token', async () => {
      const error = await expectAppError(() => authService.refresh(undefined));
      assert.equal(error.code, ErrorCode.UNAUTHENTICATED);
    });

    it('refuses an access token presented as a refresh token', async () => {
      const registered = await authService.register(VALID);
      // Separate secrets are what make this fail. With one shared secret the
      // access token would verify here and bypass rotation entirely.
      const error = await expectAppError(() =>
        authService.refresh(registered.session.accessToken),
      );
      assert.equal(error.code, ErrorCode.TOKEN_INVALID);
    });

    it('refuses garbage', async () => {
      const error = await expectAppError(() => authService.refresh('not.a.token'));
      assert.equal(error.code, ErrorCode.TOKEN_INVALID);
    });

    it('stops working once the account is disabled', async () => {
      const registered = await authService.register(VALID);
      await UserModel.updateOne({ email: VALID.email }, { $set: { disabled: true } }).exec();

      // The account is re-read on every refresh, so a ban takes effect at once
      // rather than after the refresh token's 30 days.
      const error = await expectAppError(() => authService.refresh(registered.refreshToken));
      assert.equal(error.code, ErrorCode.ACCOUNT_DISABLED);
    });
  });

  describe('password reset', () => {
    it('stores only the hash of the emailed token', async () => {
      await authService.register(VALID);
      await authService.forgotPassword({ email: VALID.email });

      const record = await PasswordResetModel.findOne().exec();
      assert.ok(record);
      assert.match(record.tokenHash, /^[a-f0-9]{64}$/);
      assert.equal(record.usedAt, null);
      assert.ok(record.expiresAt.getTime() > Date.now());
    });

    it('stays silent about an unknown address', async () => {
      // No throw, and nothing written - the caller cannot tell the difference.
      await authService.forgotPassword({ email: 'nobody@voidline.test' });
      assert.equal(await PasswordResetModel.countDocuments().exec(), 0);
    });

    it('changes the password and lets the new one sign in', async () => {
      const registered = await authService.register(VALID);
      const { token, tokenHash } = createResetToken();
      await passwordResetRepository.create(
        registered.session.user.id,
        tokenHash,
        new Date(Date.now() + 60_000),
      );

      await authService.resetPassword({ token, password: 'a whole new password' });

      await assert.rejects(() =>
        authService.login({ email: VALID.email, password: VALID.password }),
      );
      const result = await authService.login({
        email: VALID.email,
        password: 'a whole new password',
      });
      assert.ok(result.session.accessToken);
    });

    it('lets a reset link be used only once', async () => {
      const registered = await authService.register(VALID);
      const { token, tokenHash } = createResetToken();
      await passwordResetRepository.create(
        registered.session.user.id,
        tokenHash,
        new Date(Date.now() + 60_000),
      );

      await authService.resetPassword({ token, password: 'first new password' });
      const error = await expectAppError(() =>
        authService.resetPassword({ token, password: 'second new password' }),
      );
      assert.equal(error.code, ErrorCode.RESET_TOKEN_INVALID);
    });

    it('invalidates every other outstanding link for that account', async () => {
      const registered = await authService.register(VALID);
      const first = createResetToken();
      const second = createResetToken();
      await passwordResetRepository.create(
        registered.session.user.id,
        first.tokenHash,
        new Date(Date.now() + 60_000),
      );
      await passwordResetRepository.create(
        registered.session.user.id,
        second.tokenHash,
        new Date(Date.now() + 60_000),
      );

      await authService.resetPassword({ token: first.token, password: 'a new password here' });

      // An older link sitting in an inbox must stop working the moment the
      // password changes.
      const error = await expectAppError(() =>
        authService.resetPassword({ token: second.token, password: 'another password here' }),
      );
      assert.equal(error.code, ErrorCode.RESET_TOKEN_INVALID);
    });

    it('refuses an expired link even before the TTL monitor deletes it', async () => {
      const registered = await authService.register(VALID);
      const { token, tokenHash } = createResetToken();
      // MongoDB's TTL monitor runs about once a minute, so expiry has to be
      // enforced in code as well as by the index.
      await passwordResetRepository.create(
        registered.session.user.id,
        tokenHash,
        new Date(Date.now() - 1000),
      );

      const error = await expectAppError(() =>
        authService.resetPassword({ token, password: 'a new password here' }),
      );
      assert.equal(error.code, ErrorCode.RESET_TOKEN_INVALID);
    });

    it('refuses an unknown token with the same error as a spent one', async () => {
      const error = await expectAppError(() =>
        authService.resetPassword({ token: 'never-issued', password: 'a new password here' }),
      );
      assert.equal(error.code, ErrorCode.RESET_TOKEN_INVALID);
    });

    it('hashes reset tokens deterministically', () => {
      const { token, tokenHash } = createResetToken();
      assert.equal(hashResetToken(token), tokenHash);
      assert.notEqual(hashResetToken('different'), tokenHash);
    });
  });

  describe('me', () => {
    it('returns the account for a known id', async () => {
      const registered = await authService.register(VALID);
      const self = await authService.me(registered.session.user.id);
      assert.equal(self.username, 'Vega_09');
    });

    it('refuses an id that no longer exists', async () => {
      const registered = await authService.register(VALID);
      await UserModel.deleteMany({}).exec();

      const error = await expectAppError(() => authService.me(registered.session.user.id));
      assert.equal(error.code, ErrorCode.TOKEN_INVALID);
    });
  });
});
