import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import { ErrorCode, LeaderboardScope } from '@voidline/shared';
import { AppError } from '../lib/AppError';
import { FriendshipModel } from '../models/Friendship';
import { UserModel } from '../models/User';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from '../test/dbHarness';
import { authService } from './authService';
import { friendService } from './friendService';
import { leaderboardService } from './leaderboardService';

async function expectAppError(run: () => Promise<unknown>): Promise<AppError> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof AppError, `expected AppError, got ${String(error)}`);
    return error;
  }
  assert.fail('expected the call to throw');
}

let seq = 0;
async function makePlayer(xp = 0) {
  seq += 1;
  const { session } = await authService.register({
    username: `Crew_${seq}`,
    email: `crew${seq}@voidline.test`,
    password: 'correct horse battery',
  });

  if (xp > 0) {
    const user = await UserModel.findById(session.user.id).exec();
    user!.xp = xp;
    await user!.save();
  }

  return session.user;
}

describe('friends and leaderboard', { timeout: 120_000 }, () => {
  before(async () => {
    await startTestDatabase();
  });
  after(async () => {
    await stopTestDatabase();
  });
  afterEach(async () => {
    await clearTestDatabase();
  });

  describe('friend requests', () => {
    it('creates a pending request', async () => {
      const a = await makePlayer();
      const b = await makePlayer();

      const result = await friendService.request(a.id, b.id);
      assert.equal(result.status, 'PENDING');
      assert.equal(result.user.id, b.id);
      assert.equal(result.incoming, false);
    });

    it('shows the request as incoming to the recipient', async () => {
      const a = await makePlayer();
      const b = await makePlayer();
      await friendService.request(a.id, b.id);

      const forB = await friendService.list(b.id);
      assert.equal(forB.length, 1);
      assert.equal(forB[0]!.incoming, true, 'the recipient should see it as incoming');
    });

    it('stores one row per relationship, not two', async () => {
      const a = await makePlayer();
      const b = await makePlayer();

      await friendService.request(a.id, b.id);
      await friendService.request(b.id, a.id);

      // Two rows would be able to disagree about the status.
      assert.equal(await FriendshipModel.countDocuments().exec(), 1);
    });

    it('treats a reciprocal request as an acceptance', async () => {
      const a = await makePlayer();
      const b = await makePlayer();

      await friendService.request(a.id, b.id);
      const result = await friendService.request(b.id, a.id);

      // Making them find the other button would be pedantry.
      assert.equal(result.status, 'ACCEPTED');
    });

    it('refuses adding yourself', async () => {
      const a = await makePlayer();
      const error = await expectAppError(() => friendService.request(a.id, a.id));
      assert.equal(error.code, ErrorCode.TARGET_INVALID);
    });

    it('reports an unknown player as not found', async () => {
      const a = await makePlayer();
      const error = await expectAppError(() =>
        friendService.request(a.id, '0123456789abcdef01234567'),
      );
      assert.equal(error.code, ErrorCode.NOT_FOUND);
    });

    it('reports a disabled player as not found', async () => {
      const a = await makePlayer();
      const b = await makePlayer();
      await UserModel.updateOne({ _id: b.id }, { $set: { disabled: true } }).exec();

      // Same error as a missing account, so this cannot be used to confirm a ban.
      const error = await expectAppError(() => friendService.request(a.id, b.id));
      assert.equal(error.code, ErrorCode.NOT_FOUND);
    });
  });

  describe('accepting and removing', () => {
    it('lets the recipient accept', async () => {
      const a = await makePlayer();
      const b = await makePlayer();
      const request = await friendService.request(a.id, b.id);

      const accepted = await friendService.accept(b.id, request.id);
      assert.equal(accepted.status, 'ACCEPTED');
    });

    it('refuses the requester accepting their own request', async () => {
      const a = await makePlayer();
      const b = await makePlayer();
      const request = await friendService.request(a.id, b.id);

      const error = await expectAppError(() => friendService.accept(a.id, request.id));
      assert.equal(error.code, ErrorCode.TARGET_INVALID);
    });

    it('reports somebody else request as not found, not forbidden', async () => {
      const a = await makePlayer();
      const b = await makePlayer();
      const outsider = await makePlayer();
      const request = await friendService.request(a.id, b.id);

      // NOT_FOUND rather than a permission error, so the endpoint cannot be
      // used to probe which friendship ids exist.
      const error = await expectAppError(() => friendService.accept(outsider.id, request.id));
      assert.equal(error.code, ErrorCode.NOT_FOUND);
    });

    it('removes a friendship from both sides', async () => {
      const a = await makePlayer();
      const b = await makePlayer();
      const request = await friendService.request(a.id, b.id);
      await friendService.accept(b.id, request.id);

      await friendService.remove(a.id, request.id);

      assert.deepEqual(await friendService.list(a.id), []);
      assert.deepEqual(await friendService.list(b.id), []);
    });

    it('refuses an outsider removing a friendship', async () => {
      const a = await makePlayer();
      const b = await makePlayer();
      const outsider = await makePlayer();
      const request = await friendService.request(a.id, b.id);

      const error = await expectAppError(() => friendService.remove(outsider.id, request.id));
      assert.equal(error.code, ErrorCode.NOT_FOUND);
      assert.equal(await FriendshipModel.countDocuments().exec(), 1);
    });
  });

  describe('blocking', () => {
    it('hides a blocked player from the friends list', async () => {
      const a = await makePlayer();
      const b = await makePlayer();
      await friendService.block(a.id, b.id);

      assert.deepEqual(await friendService.list(a.id), []);
      assert.deepEqual(await friendService.list(b.id), []);
    });

    it('stops the blocked player re-requesting, without telling them why', async () => {
      const a = await makePlayer();
      const b = await makePlayer();
      await friendService.block(a.id, b.id);

      // "No such player" rather than "you are blocked": revealing the block
      // would tell the blocked person they were blocked.
      const error = await expectAppError(() => friendService.request(b.id, a.id));
      assert.equal(error.code, ErrorCode.NOT_FOUND);
    });

    it('refuses blocking yourself', async () => {
      const a = await makePlayer();
      const error = await expectAppError(() => friendService.block(a.id, a.id));
      assert.equal(error.code, ErrorCode.TARGET_INVALID);
    });
  });

  describe('leaderboard', () => {
    it('ranks by XP, highest first', async () => {
      const low = await makePlayer(100);
      const high = await makePlayer(5000);
      const middle = await makePlayer(1000);

      const page = await leaderboardService.page(low.id, LeaderboardScope.WORLD, 1, 25);

      assert.deepEqual(
        page.items.map((entry) => entry.id),
        [high.id, middle.id, low.id],
      );
      assert.deepEqual(
        page.items.map((entry) => entry.rank),
        [1, 2, 3],
      );
    });

    it('never exposes an email', async () => {
      const viewer = await makePlayer(100);
      await makePlayer(500);

      const page = await leaderboardService.page(viewer.id, LeaderboardScope.WORLD, 1, 25);

      for (const entry of page.items) {
        assert.equal('email' in entry, false, 'the leaderboard leaked an email address');
      }
    });

    it('reports the viewer own rank without paging to it', async () => {
      const viewer = await makePlayer(100);
      await makePlayer(5000);
      await makePlayer(1000);

      const page = await leaderboardService.page(viewer.id, LeaderboardScope.WORLD, 1, 1);

      assert.equal(page.items.length, 1);
      assert.equal(page.viewerRank, 3, 'rank should be counted, not found by scanning');
    });

    it('paginates', async () => {
      for (let i = 0; i < 5; i++) await makePlayer((i + 1) * 100);
      const viewer = await makePlayer(50);

      const first = await leaderboardService.page(viewer.id, LeaderboardScope.WORLD, 1, 2);
      const second = await leaderboardService.page(viewer.id, LeaderboardScope.WORLD, 2, 2);

      assert.equal(first.items.length, 2);
      assert.equal(first.hasMore, true);
      assert.equal(second.items[0]!.rank, 3);
      assert.notEqual(first.items[0]!.id, second.items[0]!.id);
    });

    it('excludes disabled accounts', async () => {
      const viewer = await makePlayer(100);
      const banned = await makePlayer(9000);
      await UserModel.updateOne({ _id: banned.id }, { $set: { disabled: true } }).exec();

      const page = await leaderboardService.page(viewer.id, LeaderboardScope.WORLD, 1, 25);
      assert.equal(
        page.items.some((entry) => entry.id === banned.id),
        false,
      );
    });

    it('limits the friends board to accepted friends, plus the viewer', async () => {
      const viewer = await makePlayer(100);
      const friend = await makePlayer(500);
      const stranger = await makePlayer(9000);
      const pending = await makePlayer(700);

      const request = await friendService.request(viewer.id, friend.id);
      await friendService.accept(friend.id, request.id);
      // Requested but not accepted: not a friend yet.
      await friendService.request(viewer.id, pending.id);

      const page = await leaderboardService.page(viewer.id, LeaderboardScope.FRIENDS, 1, 25);
      const ids = page.items.map((entry) => entry.id);

      assert.ok(ids.includes(viewer.id), 'the viewer should be on their own board');
      assert.ok(ids.includes(friend.id));
      assert.equal(ids.includes(stranger.id), false);
      assert.equal(ids.includes(pending.id), false, 'a pending request is not a friend');
    });

    it('ranks the friends board within itself, not globally', async () => {
      const viewer = await makePlayer(100);
      const friend = await makePlayer(500);
      await makePlayer(99_999);

      const request = await friendService.request(viewer.id, friend.id);
      await friendService.accept(friend.id, request.id);

      const page = await leaderboardService.page(viewer.id, LeaderboardScope.FRIENDS, 1, 25);

      assert.equal(page.items[0]!.id, friend.id);
      assert.equal(page.items[0]!.rank, 1);
      assert.equal(page.viewerRank, 2);
    });
  });
});
