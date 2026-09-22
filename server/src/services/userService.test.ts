import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import { AchievementId, DEFAULT_AVATAR_ID, ErrorCode } from '@voidline/shared';
import { AppError } from '../lib/AppError';
import { UserModel } from '../models/User';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from '../test/dbHarness';
import {
  EMPTY_PROGRESS,
  achievementProgressRatio,
  evaluateAchievements,
} from './achievementService';
import { authService } from './authService';
import { userService } from './userService';

const ACCOUNT = {
  username: 'Vega_09',
  email: 'vega@voidline.test',
  password: 'correct horse battery',
};

async function expectAppError(run: () => Promise<unknown>): Promise<AppError> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof AppError, `expected AppError, got ${String(error)}`);
    return error;
  }
  assert.fail('expected the call to throw');
}

describe('userService', { timeout: 120_000 }, () => {
  before(async () => {
    await startTestDatabase();
  });
  after(async () => {
    await stopTestDatabase();
  });
  afterEach(async () => {
    await clearTestDatabase();
  });

  async function makeUser() {
    const { session } = await authService.register(ACCOUNT);
    return session.user;
  }

  describe('profile visibility', () => {
    it('gives the owner their own email', async () => {
      const user = await makeUser();
      const self = await userService.getSelf(user.id);
      assert.equal(self.email, ACCOUNT.email);
    });

    it('never puts an email on a public profile', async () => {
      const user = await makeUser();
      const profile = await userService.getProfile(user.id);

      // The single most important assertion in this file: a public profile is
      // a different projection, not the same object with a flag.
      assert.equal('email' in profile, false);
      assert.equal(profile.username, 'Vega_09');
    });

    it('reports a disabled account as not found, not as disabled', async () => {
      const user = await makeUser();
      await UserModel.updateOne({ _id: user.id }, { $set: { disabled: true } }).exec();

      // A ban must not be confirmable by anyone who knows the profile URL.
      const error = await expectAppError(() => userService.getProfile(user.id));
      assert.equal(error.code, ErrorCode.NOT_FOUND);
    });

    it('reports an unknown id as not found', async () => {
      const error = await expectAppError(() =>
        userService.getProfile('0123456789abcdef01234567'),
      );
      assert.equal(error.code, ErrorCode.NOT_FOUND);
    });
  });

  describe('updateProfile', () => {
    it('starts every account on the default avatar', async () => {
      const user = await makeUser();
      assert.equal(user.avatar, DEFAULT_AVATAR_ID);
    });

    it('changes the avatar to another preset', async () => {
      const user = await makeUser();
      const updated = await userService.updateProfile(user.id, { avatar: 'operator-05' });
      assert.equal(updated.avatar, 'operator-05');
    });

    it('refuses an avatar that is not on the roster', async () => {
      const user = await makeUser();
      const error = await expectAppError(() =>
        // The attack this blocks: setting an avatar every other player's
        // browser will then fetch from a server the attacker controls.
        userService.updateProfile(user.id, { avatar: 'https://evil.example/pixel.gif' as never }),
      );
      assert.equal(error.code, ErrorCode.VALIDATION_ERROR);
    });

    it('changes the username', async () => {
      const user = await makeUser();
      const updated = await userService.updateProfile(user.id, { username: 'Rhodes_12' });
      assert.equal(updated.username, 'Rhodes_12');
    });

    it('allows changing only the case of your own username', async () => {
      const user = await makeUser();
      // The collation lookup finds this very account; it must not be treated
      // as somebody else holding the name.
      const updated = await userService.updateProfile(user.id, { username: 'VEGA_09' });
      assert.equal(updated.username, 'VEGA_09');
    });

    it('refuses a username another player holds', async () => {
      const user = await makeUser();
      await authService.register({
        username: 'Rhodes_12',
        email: 'rhodes@voidline.test',
        password: 'another good password',
      });

      const error = await expectAppError(() =>
        userService.updateProfile(user.id, { username: 'Rhodes_12' }),
      );
      assert.equal(error.code, ErrorCode.USERNAME_TAKEN);
    });

    it('refuses a username another player holds in a different case', async () => {
      const user = await makeUser();
      await authService.register({
        username: 'Rhodes_12',
        email: 'rhodes@voidline.test',
        password: 'another good password',
      });

      const error = await expectAppError(() =>
        userService.updateProfile(user.id, { username: 'rhodes_12' }),
      );
      assert.equal(error.code, ErrorCode.USERNAME_TAKEN);
    });

    it('cannot be used to award XP, levels or stats', async () => {
      const user = await makeUser();

      await userService.updateProfile(user.id, {
        avatar: 'operator-03',
        // Fields the service does not read. If it merged the body instead of
        // picking fields, this call would hand the caller 999999 XP.
        xp: 999_999,
        level: 99,
        stats: { matchesWon: 500 },
      } as never);

      const after = await userService.getSelf(user.id);
      assert.equal(after.xp, 0);
      assert.equal(after.level, 1);
      assert.equal(after.stats.matchesWon, 0);
      assert.equal(after.avatar, 'operator-03');
    });
  });

  describe('achievement criteria', () => {
    it('awards nothing on an empty account', () => {
      assert.deepEqual(evaluateAchievements(EMPTY_PROGRESS, []), []);
    });

    it('awards the first-match achievement after one match', () => {
      const earned = evaluateAchievements({ ...EMPTY_PROGRESS, matchesPlayed: 1 }, []);
      assert.deepEqual(earned, [AchievementId.FIRST_MATCH]);
    });

    it('awards several at once when several thresholds are crossed', () => {
      const earned = evaluateAchievements(
        { ...EMPTY_PROGRESS, matchesPlayed: 1, matchesWon: 1 },
        [],
      );
      assert.ok(earned.includes(AchievementId.FIRST_MATCH));
      assert.ok(earned.includes(AchievementId.FIRST_VICTORY));
    });

    it('never re-awards one already held', () => {
      const earned = evaluateAchievements({ ...EMPTY_PROGRESS, matchesPlayed: 5 }, [
        AchievementId.FIRST_MATCH,
      ]);
      assert.deepEqual(earned, []);
    });

    it('holds back a threshold achievement until the threshold is met', () => {
      assert.deepEqual(
        evaluateAchievements({ ...EMPTY_PROGRESS, objectivesCompleted: 99 }, []),
        [],
      );
      assert.deepEqual(
        evaluateAchievements({ ...EMPTY_PROGRESS, objectivesCompleted: 100 }, []),
        [AchievementId.OBJECTIVE_EXPERT],
      );
    });

    it('reports partial progress for counted achievements', () => {
      const ratio = achievementProgressRatio(AchievementId.OBJECTIVE_EXPERT, {
        ...EMPTY_PROGRESS,
        objectivesCompleted: 42,
      });
      assert.deepEqual(ratio, { current: 42, target: 100 });
    });

    it('caps reported progress at the target', () => {
      const ratio = achievementProgressRatio(AchievementId.SURVIVOR, {
        ...EMPTY_PROGRESS,
        matchesSurvived: 25,
      });
      assert.deepEqual(ratio, { current: 10, target: 10 });
    });

    it('reports no bar for all-or-nothing achievements', () => {
      assert.equal(achievementProgressRatio(AchievementId.MASTER_SABOTEUR, EMPTY_PROGRESS), null);
    });
  });
});
