import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { delay, startE2EServer, waitForPhase, type E2EServer, type TestSocket } from './harness';

/**
 * Dropping and coming back mid-match (§48).
 *
 * The property that matters is that a dropped player keeps their seat and their
 * secrets, and that coming back does not hand them anything they were not
 * already entitled to. There is a lot of surface here that unit tests cannot
 * reach - the grace timer, the socket teardown, the resume payload and the chat
 * backlog filter are four different components, and the bug would live between
 * them.
 *
 * One specific trap is covered at the end: the input sequence counter. The
 * server resets its last-seen sequence when a socket reattaches, and the client
 * resets its own in `NetworkSync.resetSequence`. If only one of them did, every
 * packet after a reconnect would read as a replay and be dropped - a player who
 * reconnects successfully and then silently cannot move.
 */

let server: E2EServer;

describe('reconnection', { timeout: 180_000 }, () => {
  before(async () => {
    server = await startE2EServer();
  });

  after(async () => {
    await server.stop();
  });

  it('holds a seat, restores state privately, and lets the player move again', async () => {
    const players = [];
    for (const name of ['Keeper', 'Dropper', 'Third', 'Fourth']) {
      players.push(await server.register(name));
    }
    const host = players[0]!;

    const created = await server.rest<{ code: string }>('/api/rooms', {
      method: 'POST',
      token: host.token,
      body: {
        name: 'Reconnect Deck',
        maxPlayers: 4,
        saboteurCount: 1,
        objectiveCount: 1,
        killCooldown: 10,
        discussionTime: 15,
        votingTime: 15,
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    const code = created.json!.data.code;

    const sockets: TestSocket[] = [];
    for (const player of players) {
      const socket = await server.connect(player.token);
      (socket as TestSocket & { me: typeof player.user }).me = player.user;
      assert.equal((await socket.call('room:join', { code })).ok, true);
      sockets.push(socket);
    }
    for (const socket of sockets.slice(1)) {
      await socket.call('room:ready', { ready: true });
    }
    await delay(300);

    assert.equal((await sockets[0]!.call('room:start')).ok, true);
    assert.ok(
      await sockets[0]!.until(() => sockets.every((s) => s.latest('game:start') !== undefined)),
      'not every player received game:start',
    );

    type StartPayload = { self: { self: { id: string; role: string }; tasks: unknown[] } };
    const startPayloads = sockets.map((s) => s.latest<StartPayload>('game:start')!);

    assert.ok(await waitForPhase(sockets[0]!, 'PLAYING'), 'play never began');

    /* ------------------------------------------------ the drop - */

    const dropperIndex = 1;
    const dropper = players[dropperIndex]!;
    const roleBefore = startPayloads[dropperIndex]!.self.self.role;
    const tasksBefore = startPayloads[dropperIndex]!.self.tasks.length;

    sockets[dropperIndex]!.disconnect();

    /*
     * Waited for, not read once. `game:state` is event-driven, so reading the
     * latest one immediately after the drop returns a snapshot that predates
     * it - which looks exactly like the server failing to notice.
     */
    const connectionOf = (id: string) =>
      sockets[0]!
        .latest<{ players: Array<{ id: string; connection: string }> }>('game:state')
        ?.players.find((p) => p.id === id)?.connection;

    assert.ok(
      await sockets[0]!.until(() => connectionOf(dropper.user.id) === 'RECONNECTING', 10_000),
      `the match never reflected the drop (saw ${connectionOf(dropper.user.id)})`,
    );

    /*
     * The seat is held, not released. The other players must still see four
     * players - somebody vanishing from the roster on a dropped connection
     * would be a free deduction for everyone else.
     */
    const roster = sockets[0]!.latest<{ players: Array<{ id: string; connection: string }> }>(
      'game:state',
    )!;
    assert.equal(roster.players.length, 4, 'the dropped player lost their seat');

    // And nothing about the drop leaked a role.
    assert.equal(JSON.stringify(roster).includes('SABOTEUR'), false);
    assert.equal(JSON.stringify(roster).includes('OPERATOR'), false);

    /* --------------------------------------------- coming back - */

    const returned = await server.connect(dropper.token);
    assert.equal((await returned.call('room:join', { code })).ok, true);

    const resumed = await returned.call<{
      snapshot: { players: unknown[]; phase: string };
      self: { self: { id: string; role: string }; tasks: unknown[] };
      missedMessages: unknown[];
    }>('game:resume');

    assert.equal(resumed.ok, true, JSON.stringify(resumed));
    const state = (resumed as { data: { snapshot: { players: unknown[] }; self: { self: { id: string; role: string }; tasks: unknown[] } } }).data;

    // The same seat, the same role, the same objectives. A reconnect that
    // reassigned any of these would be a way to reroll a bad draw.
    assert.equal(state.self.self.id, dropper.user.id);
    assert.equal(state.self.self.role, roleBefore, 'the role changed across a reconnect');
    assert.equal(state.self.tasks.length, tasksBefore, 'the objectives changed across a reconnect');
    assert.equal(state.snapshot.players.length, 4);

    /*
     * The resume payload is the same two-part shape as game:start: a public
     * snapshot with no roles in it, and a private half on this socket alone.
     */
    const publicHalf = JSON.stringify(state.snapshot);
    assert.equal(publicHalf.includes('SABOTEUR'), false, 'the resume snapshot leaked a role');
    assert.equal(publicHalf.includes('OPERATOR'), false, 'the resume snapshot leaked a role');

    /* ------------------------------------------ movement again - */

    const positionOf = (id: string) =>
      sockets[0]!
        .all<{ players: Array<{ id: string; position: { x: number } }> }>('game:delta')
        .flatMap((delta) => delta.players)
        .filter((p) => p.id === id)
        .pop()?.position.x;

    await sockets[0]!.until(() => positionOf(dropper.user.id) !== undefined);
    const before = positionOf(dropper.user.id)!;

    /*
     * Sequence numbers restart at 1, exactly as the client's NetworkSync does
     * after a reconnect. If the server still held the pre-drop sequence, every
     * one of these would look like a replay and be dropped - and the test
     * below would report a player who is connected, alive, and frozen.
     */
    for (let i = 1; i <= 25; i++) {
      returned.emit('player:move', { sequence: i, direction: { x: 1, y: 0 }, deltaMs: 66 });
      await delay(40);
    }
    await delay(500);

    const travelled = Math.abs(positionOf(dropper.user.id)! - before);
    assert.ok(travelled > 20, `a reconnected player could not move (travelled ${travelled})`);

    returned.disconnect();
  });
});
