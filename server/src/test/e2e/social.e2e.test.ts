import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startE2EServer, type E2EServer, type TestPlayer } from './harness';

/**
 * Leaderboard and friends, against a real database with real rows (§48).
 *
 * These screens were built and reviewed without a populated state ever being
 * seen - there is no API or database on the UI side of this project, so every
 * check there was of the loading, empty and error paths. That is exactly the
 * gap this project keeps falling into: the CSP, the /design routes and the
 * unsolvable SECURITY_SCAN puzzle were all correct in every test and wrong the
 * moment someone used them.
 *
 * So this seeds accounts with different XP, builds a real friendship, places a
 * real block, and asserts on what actually comes back over HTTP.
 *
 * The privacy rules get the most attention, because they are the ones where a
 * bug is silent: a leaderboard is the one screen that lists people who are not
 * you, and a block is only worth anything if the blocked person cannot detect
 * it.
 */

let server: E2EServer;

/** Seeds XP and record directly, so the read path can be tested without playing. */
async function seed(player: TestPlayer, xp: number, wins: number, played: number) {
  const { UserModel } = await import('../../models/User');
  await UserModel.updateOne(
    { _id: player.user.id },
    { $set: { xp, 'stats.matchesWon': wins, 'stats.matchesPlayed': played } },
  ).exec();
}

interface Board {
  items: Array<{ id: string; username: string; rank: number; xp: number; wins: number }>;
  total: number;
}

interface Friend {
  id: string;
  user: { id: string; username: string };
  status: string;
  incoming: boolean;
}

describe('leaderboard and friends with real data', { timeout: 120_000 }, () => {
  let alice: TestPlayer;
  let bob: TestPlayer;
  let carol: TestPlayer;
  let dave: TestPlayer;

  before(async () => {
    server = await startE2EServer();

    alice = await server.register('Alice');
    bob = await server.register('Bob');
    carol = await server.register('Carol');
    dave = await server.register('Dave');

    await seed(alice, 5000, 12, 20);
    await seed(bob, 3000, 7, 15);
    await seed(carol, 9000, 30, 44);
    await seed(dave, 100, 0, 1);
  });

  after(async () => {
    await server.stop();
  });

  /* ------------------------------------------------------ leaderboard - */

  it('ranks the world board by XP, highest first', async () => {
    const board = await server.rest<Board>('/api/leaderboard?scope=WORLD', {
      token: alice.token,
    });

    assert.equal(board.status, 200, JSON.stringify(board.json));
    const items = board.json!.data.items;

    assert.deepEqual(
      items.map((entry) => entry.username),
      [carol, alice, bob, dave].map((p) => p.user.username),
      'the board was not ordered by XP',
    );

    // Ranks are 1-based and consecutive, because the client renders this number
    // rather than the row's position.
    assert.deepEqual(
      items.map((entry) => entry.rank),
      [1, 2, 3, 4],
    );
  });

  it('never puts an email address on a board', async () => {
    const board = await server.rest<Board>('/api/leaderboard?scope=WORLD', {
      token: dave.token,
    });

    /*
     * The leaderboard is the one screen that lists people who are not you, so
     * it is the one most likely to over-serialise. Asserted against the raw
     * response rather than the parsed shape - a field added later would slip
     * past a check that only looked at the fields it knew about.
     */
    const raw = JSON.stringify(board.json);
    assert.equal(raw.includes('@'), false, 'an email address reached the leaderboard');
    assert.equal(raw.includes('passwordHash'), false);
    assert.equal(raw.toLowerCase().includes('email'), false);
  });

  it('shows a friends board containing the viewer even with no friends', async () => {
    const board = await server.rest<Board>('/api/leaderboard?scope=FRIENDS', {
      token: dave.token,
    });

    // A board that excluded you would give a friendless player an empty screen
    // and nothing to measure against.
    assert.deepEqual(
      board.json!.data.items.map((entry) => entry.username),
      [dave.user.username],
    );
  });

  /* ---------------------------------------------------------- friends - */

  it('adds a friend by username, and the request is directional', async () => {
    const sent = await server.rest<Friend>('/api/friends/request', {
      method: 'POST',
      token: alice.token,
      body: { username: bob.user.username },
    });

    assert.equal(sent.status, 200, JSON.stringify(sent.json));
    assert.equal(sent.json!.data.status, 'PENDING');
    assert.equal(sent.json!.data.user.username, bob.user.username);

    // Alice asked, so for Alice it is outgoing and for Bob it is incoming. The
    // screen separates "waiting on you" from "waiting on them" with this flag.
    const asAlice = await server.rest<Friend[]>('/api/friends', { token: alice.token });
    assert.equal(asAlice.json!.data[0]!.incoming, false);

    const asBob = await server.rest<Friend[]>('/api/friends', { token: bob.token });
    assert.equal(asBob.json!.data[0]!.incoming, true);
    assert.equal(asBob.json!.data[0]!.user.username, alice.user.username);
  });

  it('refuses an unknown username exactly as it refuses anything else', async () => {
    const missing = await server.rest('/api/friends/request', {
      method: 'POST',
      token: alice.token,
      body: { username: 'Nobody_Here' },
    });

    assert.equal(missing.status, 404);
    assert.equal(missing.json!.message, 'No such player.');
  });

  it('accepts, and then both sides see the friendship', async () => {
    const asBob = await server.rest<Friend[]>('/api/friends', { token: bob.token });
    const pending = asBob.json!.data[0]!;

    const accepted = await server.rest<Friend>(`/api/friends/${pending.id}/accept`, {
      method: 'POST',
      token: bob.token,
    });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.json));
    assert.equal(accepted.json!.data.status, 'ACCEPTED');

    for (const player of [alice, bob]) {
      const list = await server.rest<Friend[]>('/api/friends', { token: player.token });
      assert.equal(list.json!.data[0]!.status, 'ACCEPTED');
    }
  });

  it('puts a real friend on the friends board', async () => {
    const board = await server.rest<Board>('/api/leaderboard?scope=FRIENDS', {
      token: bob.token,
    });

    // Alice has more XP, so she outranks Bob on his own friends board.
    assert.deepEqual(
      board.json!.data.items.map((entry) => entry.username),
      [alice.user.username, bob.user.username],
    );
    assert.deepEqual(
      board.json!.data.items.map((entry) => entry.rank),
      [1, 2],
    );
  });

  /* ----------------------------------------------------------- blocks - */

  it('lists a block to the person who placed it', async () => {
    const blocked = await server.rest('/api/friends/block', {
      method: 'POST',
      token: alice.token,
      body: { userId: carol.user.id },
    });
    assert.equal(blocked.status, 200, JSON.stringify(blocked.json));

    const list = await server.rest<Friend[]>('/api/friends/blocked', { token: alice.token });
    assert.equal(list.json!.data.length, 1);
    assert.equal(list.json!.data[0]!.user.username, carol.user.username);

    // And it stays out of the main list, which is what made a Blocked tab
    // impossible to populate before.
    const main = await server.rest<Friend[]>('/api/friends', { token: alice.token });
    assert.equal(
      main.json!.data.some((entry) => entry.user.username === carol.user.username),
      false,
    );
  });

  it('tells the blocked player nothing at all', async () => {
    /*
     * The property the whole block design rests on. Carol has been blocked by
     * Alice; every route Carol could use to discover that must behave as though
     * Alice simply does not exist.
     */
    const carolsBlocked = await server.rest<Friend[]>('/api/friends/blocked', {
      token: carol.token,
    });
    assert.deepEqual(carolsBlocked.json!.data, [], 'a blocked player was shown the block');

    const carolsFriends = await server.rest<Friend[]>('/api/friends', { token: carol.token });
    assert.deepEqual(carolsFriends.json!.data, []);

    const attempt = await server.rest('/api/friends/request', {
      method: 'POST',
      token: carol.token,
      body: { username: alice.user.username },
    });
    assert.equal(attempt.status, 404);
    // Identical to an account that never existed. Any other wording here, or
    // any other status, would confirm the block.
    assert.equal(attempt.json!.message, 'No such player.');
  });

  it('refuses to let the blocked player lift the block', async () => {
    const alicesBlocks = await server.rest<Friend[]>('/api/friends/blocked', {
      token: alice.token,
    });
    const blockId = alicesBlocks.json!.data[0]!.id;

    /*
     * Carol is a participant in this row, so the ordinary remove path would
     * have deleted it for her - which is why lifting a block is a separate
     * operation that checks who placed it.
     */
    const stolen = await server.rest(`/api/friends/blocked/${blockId}`, {
      method: 'DELETE',
      token: carol.token,
    });
    assert.equal(stolen.status, 404);

    const stillThere = await server.rest<Friend[]>('/api/friends/blocked', {
      token: alice.token,
    });
    assert.equal(stillThere.json!.data.length, 1, 'the blocked player cleared the block');
  });

  it('lets the blocker lift it, after which requests work again', async () => {
    const alicesBlocks = await server.rest<Friend[]>('/api/friends/blocked', {
      token: alice.token,
    });
    const blockId = alicesBlocks.json!.data[0]!.id;

    const lifted = await server.rest(`/api/friends/blocked/${blockId}`, {
      method: 'DELETE',
      token: alice.token,
    });
    assert.equal(lifted.status, 200, JSON.stringify(lifted.json));

    const empty = await server.rest<Friend[]>('/api/friends/blocked', { token: alice.token });
    assert.deepEqual(empty.json!.data, []);

    const retry = await server.rest<Friend>('/api/friends/request', {
      method: 'POST',
      token: carol.token,
      body: { username: alice.user.username },
    });
    assert.equal(retry.status, 200, JSON.stringify(retry.json));
    assert.equal(retry.json!.data.status, 'PENDING');
  });

  it('refuses a request that names nobody', async () => {
    const empty = await server.rest('/api/friends/request', {
      method: 'POST',
      token: alice.token,
      body: {},
    });
    assert.equal(empty.status, 400);
  });
});
