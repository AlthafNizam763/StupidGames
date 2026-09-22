import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import { ErrorCode, MOVEMENT_INPUT_HZ } from '@voidline/shared';
import { AppError } from '../lib/AppError';
import { UserModel } from '../models/User';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from '../test/dbHarness';
import { authService } from '../services/authService';
import { AbuseTracker } from './abuse';
import { SequenceGuard } from './sequence';

/**
 * Abuse limits and session revocation (§30, §42).
 *
 * These cover the two gaps Phase 25 found rather than re-testing the rules
 * themselves - movement escaping the rate limiter, and refresh tokens that
 * survived a password change.
 */

describe('AbuseTracker', () => {
  describe('movement budget', () => {
    it('allows a client pacing itself to the documented rate', () => {
      const tracker = new AbuseTracker('u1', 's1');
      const start = 1_000_000;

      // The shared contract says 15/second; the budget is triple that.
      for (let i = 0; i < MOVEMENT_INPUT_HZ; i++) {
        assert.equal(tracker.allowMovement(start + i * 10), true, `input ${i} was dropped`);
      }
    });

    it('tolerates a burst after a stall', () => {
      const tracker = new AbuseTracker('u1', 's1');
      const start = 1_000_000;

      // A client that hiccups and catches up sends more than 15 in a window.
      // Disconnecting them would punish bad wifi, not cheating.
      for (let i = 0; i < MOVEMENT_INPUT_HZ * 2; i++) {
        assert.equal(tracker.allowMovement(start + i), true, `burst input ${i} was dropped`);
      }
    });

    it('drops a flood', () => {
      const tracker = new AbuseTracker('u1', 's1');
      const start = 1_000_000;
      let allowed = 0;

      // Ten thousand in one second: the server would clamp each one's effect
      // and still pay to parse every one of them.
      for (let i = 0; i < 10_000; i++) {
        if (tracker.allowMovement(start)) allowed += 1;
      }

      assert.ok(allowed <= MOVEMENT_INPUT_HZ * 3, `${allowed} inputs got through`);
    });

    it('refills the budget in the next window', () => {
      const tracker = new AbuseTracker('u1', 's1');
      const start = 1_000_000;

      for (let i = 0; i < 10_000; i++) tracker.allowMovement(start);
      assert.equal(tracker.allowMovement(start), false);

      // A second later, a legitimate client carries on unaffected.
      assert.equal(tracker.allowMovement(start + 1001), true);
    });
  });

  describe('rejection tracking', () => {
    it('tolerates the occasional rejected action', () => {
      const tracker = new AbuseTracker('u1', 's1');
      const start = 1_000_000;

      // Clicking at the wrong moment, or a kill arriving a tick after a meeting
      // opened, is normal play.
      for (let i = 0; i < 10; i++) {
        assert.equal(tracker.recordRejection(ErrorCode.COOLDOWN_ACTIVE, start), false);
      }
    });

    it('asks for a disconnect under sustained rejection', () => {
      const tracker = new AbuseTracker('u1', 's1');
      const start = 1_000_000;

      let disconnect = false;
      for (let i = 0; i < 100 && !disconnect; i++) {
        disconnect = tracker.recordRejection(ErrorCode.NOT_SABOTEUR, start);
      }

      assert.equal(disconnect, true, 'a script probing for an unguarded action was tolerated');
    });

    it('forgives a player once the window passes', () => {
      const tracker = new AbuseTracker('u1', 's1');
      const start = 1_000_000;

      for (let i = 0; i < 39; i++) tracker.recordRejection(ErrorCode.OUT_OF_RANGE, start);

      // A player who had a bad minute is not a cheater a minute later.
      assert.equal(tracker.recordRejection(ErrorCode.OUT_OF_RANGE, start + 20_000), false);
    });
  });
});

describe('SequenceGuard under replay', () => {
  it('rejects a captured burst replayed wholesale', () => {
    const guard = new SequenceGuard();

    // A legitimate run of inputs.
    const captured = [1, 2, 3, 4, 5];
    for (const sequence of captured) assert.equal(guard.check(sequence).accepted, true);

    /*
     * The attack: resend the same valid packets. Each one individually passed
     * every other check, so without the sequence guard this is a speed hack
     * made entirely of legitimate messages.
     */
    for (const sequence of captured) {
      const result = guard.check(sequence);
      assert.equal(result.accepted, false);
      assert.equal(result.reason, 'replay');
    }
  });
});

describe('session revocation', { timeout: 120_000 }, () => {
  before(async () => {
    await startTestDatabase();
  });
  after(async () => {
    await stopTestDatabase();
  });
  afterEach(async () => {
    await clearTestDatabase();
  });

  const account = {
    username: 'Vega_09',
    email: 'vega@voidline.test',
    password: 'correct horse battery',
  };

  it('keeps a refresh token working normally', async () => {
    const registered = await authService.register(account);
    const refreshed = await authService.refresh(registered.refreshToken);
    assert.equal(refreshed.session.user.id, registered.session.user.id);
  });

  it('kills every existing session when the password is reset', async () => {
    const registered = await authService.register(account);

    // Two devices, both signed in.
    const second = await authService.login({ email: account.email, password: account.password });

    const { createResetToken } = await import('../lib/tokens');
    const { passwordResetRepository } = await import('../repositories/PasswordResetRepository');
    const { token, tokenHash } = createResetToken();
    await passwordResetRepository.create(
      registered.session.user.id,
      tokenHash,
      new Date(Date.now() + 60_000),
    );

    await authService.resetPassword({ token, password: 'a brand new password' });

    /*
     * The case this exists for: you reset your password *because* it was
     * stolen. If the thief's thirty-day refresh token kept working, the reset
     * would have achieved nothing.
     */
    await assert.rejects(() => authService.refresh(registered.refreshToken));
    await assert.rejects(() => authService.refresh(second.refreshToken));
  });

  it('issues working tokens again after the reset', async () => {
    const registered = await authService.register(account);

    const { createResetToken } = await import('../lib/tokens');
    const { passwordResetRepository } = await import('../repositories/PasswordResetRepository');
    const { token, tokenHash } = createResetToken();
    await passwordResetRepository.create(
      registered.session.user.id,
      tokenHash,
      new Date(Date.now() + 60_000),
    );
    await authService.resetPassword({ token, password: 'a brand new password' });

    const fresh = await authService.login({
      email: account.email,
      password: 'a brand new password',
    });

    // The new session is minted at the new version, so it survives.
    const refreshed = await authService.refresh(fresh.refreshToken);
    assert.ok(refreshed.session.accessToken);
  });

  it('refuses a token whose version has been bumped by anything else', async () => {
    const registered = await authService.register(account);

    // Bumping the counter directly is how an administrative "sign out
    // everywhere" would work; the mechanism must not care why it moved.
    await UserModel.updateOne({ _id: registered.session.user.id }, { $inc: { tokenVersion: 1 } }).exec();

    const error = await authService
      .refresh(registered.refreshToken)
      .then(() => null)
      .catch((caught: unknown) => caught);

    assert.ok(error instanceof AppError);
    assert.equal(error.code, ErrorCode.TOKEN_INVALID);
  });
});
