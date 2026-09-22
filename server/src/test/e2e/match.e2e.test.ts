import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { delay, startE2EServer, waitForPhase, type E2EServer, type TestSocket } from './harness';

/**
 * A whole match, over real sockets (§48).
 *
 * The integration test the spec asks for: four clients create a room, join,
 * ready up, start, play, call a council, vote, and reach a decided outcome with
 * XP written and history recorded.
 *
 * It is one long test rather than many small ones on purpose. A match is a
 * sequence - you cannot vote before a council, and you cannot have a council
 * before a body or an emergency - so splitting it into independent cases would
 * mean re-driving the whole sequence for each, and each would be testing the
 * setup more than the assertion.
 */

let server: E2EServer;

describe('a full match', { timeout: 180_000 }, () => {
  before(async () => {
    server = await startE2EServer();
  });

  after(async () => {
    await server.stop();
  });

  it('plays from lobby to result', async () => {
    /* ------------------------------------------------- set-up - */

    const players = [];
    for (const name of ['Host', 'Crew', 'Tech', 'Medic']) {
      players.push(await server.register(name));
    }
    const host = players[0]!;

    const created = await server.rest<{ code: string; id: string }>('/api/rooms', {
      method: 'POST',
      token: host.token,
      body: {
        name: 'Integration Deck',
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
      const joined = await socket.call('room:join', { code });
      assert.equal(joined.ok, true, JSON.stringify(joined));
      sockets.push(socket);
    }

    for (const socket of sockets.slice(1)) {
      assert.equal((await socket.call('room:ready', { ready: true })).ok, true);
    }
    await delay(300);

    /* -------------------------------------------------- start - */

    const started = await sockets[0]!.call('room:start');
    assert.equal(started.ok, true, JSON.stringify(started));

    assert.ok(
      await sockets[0]!.until(() => sockets.every((s) => s.latest('game:start') !== undefined)),
      'not every player received game:start',
    );

    /*
     * The role is at `payload.self.self.role`.
     *
     * `game:start` carries `{ snapshot, self }`, and that `self` is a
     * `GameSelfState` — which itself wraps `{ self, tasks }`. Reading
     * `payload.self.role` yields undefined, and `Array.join` renders undefined
     * as an empty string, so the first version of this test reported
     * "roles were ,,," rather than pointing at the wrong path.
     */
    type StartPayload = {
      snapshot: unknown;
      self: { self: { role: string; allyIds: string[] }; tasks: unknown[] };
    };

    const startPayloads = sockets.map((s) => s.latest<StartPayload>('game:start')!);
    const roles = startPayloads.map((p) => p.self.self.role);
    assert.equal(roles.filter((r) => r === 'SABOTEUR').length, 1, `roles were ${roles.join(',')}`);

    const saboteurIndex = roles.indexOf('SABOTEUR');
    const saboteur = sockets[saboteurIndex]!;
    const operators = sockets.filter((_, index) => index !== saboteurIndex);

    /* ----------------------------------------- secrecy on the wire - */

    const snapshot = JSON.stringify(sockets[0]!.latest('game:start'));
    // `game:start` carries this socket's own `self`, so a role appears once -
    // in the private half. The public snapshot inside it must have none.
    const publicHalf = JSON.stringify(
      (sockets[0]!.latest<{ snapshot: unknown }>('game:start') as { snapshot: unknown }).snapshot,
    );
    assert.equal(publicHalf.includes('SABOTEUR'), false, 'the snapshot leaked a role');
    assert.equal(publicHalf.includes('OPERATOR'), false, 'the snapshot leaked a role');
    assert.ok(snapshot.length > 0);

    for (const socket of operators) {
      const view = startPayloads[sockets.indexOf(socket)]!;
      assert.deepEqual(
        view.self.self.allyIds,
        [],
        'an Operator learned something about somebody',
      );
      assert.ok(view.self.tasks.length > 0, 'an Operator got no objectives');
    }
    assert.equal(
      startPayloads[saboteurIndex]!.self.tasks.length,
      0,
      'the Saboteur was given objectives',
    );

    /* ------------------------------------- refusals during the reveal - */

    const duringReveal = await saboteur.call('player:eliminate', {
      targetId: (operators[0] as TestSocket & { me: { id: string } }).me.id,
    });
    assert.equal(duringReveal.ok, false);
    // Nothing is permitted while the role reveal is on screen.
    assert.equal((duringReveal as { code: string }).code, 'WRONG_PHASE');

    assert.ok(await waitForPhase(sockets[0]!, 'PLAYING'), 'play never began');

    /* ---------------------------------------------- authority - */

    const operatorKill = await operators[0]!.call('player:eliminate', {
      targetId: (operators[1] as TestSocket & { me: { id: string } }).me.id,
    });
    assert.equal((operatorKill as { code: string }).code, 'NOT_SABOTEUR');

    const operatorSabotage = await operators[0]!.call('sabotage:start', {
      type: 'REACTOR_FAILURE',
    });
    assert.equal((operatorSabotage as { code: string }).code, 'NOT_SABOTEUR');

    const onCooldown = await saboteur.call('player:eliminate', {
      targetId: (operators[0] as TestSocket & { me: { id: string } }).me.id,
    });
    assert.equal((onCooldown as { code: string }).code, 'COOLDOWN_ACTIVE');

    /* ---------------------------------------------- movement - */

    const positionOf = (id: string) =>
      sockets[0]!
        .all<{ players: Array<{ id: string; position: { x: number } }> }>('game:delta')
        .flatMap((delta) => delta.players)
        .filter((p) => p.id === id)
        .pop()?.position.x;

    const moverId = (operators[0] as TestSocket & { me: { id: string } }).me.id;
    const hackerId = (operators[1] as TestSocket & { me: { id: string } }).me.id;

    await sockets[0]!.until(() => positionOf(moverId) !== undefined);
    const beforeHonest = positionOf(moverId)!;
    const beforeHack = positionOf(hackerId)!;

    for (let i = 1; i <= 25; i++) {
      operators[0]!.emit('player:move', { sequence: i, direction: { x: 1, y: 0 }, deltaMs: 66 });
      // A forged direction vector, fifty times unit length.
      operators[1]!.emit('player:move', { sequence: i, direction: { x: 50, y: 0 }, deltaMs: 66 });
      await delay(40);
    }
    await delay(500);

    const honestTravel = Math.abs(positionOf(moverId)! - beforeHonest);
    const hackedTravel = Math.abs(positionOf(hackerId)! - beforeHack);

    assert.ok(honestTravel > 20, `honest player did not move (${honestTravel})`);
    assert.ok(
      hackedTravel <= honestTravel * 1.5,
      `a forged vector travelled ${hackedTravel} against an honest ${honestTravel}`,
    );

    /* ----------------------------------------------- council - */

    const emergency = await operators[0]!.call('council:emergency');
    assert.equal(emergency.ok, true, JSON.stringify(emergency));

    assert.ok(await waitForPhase(sockets[0]!, 'COUNCIL'), 'the council never opened');

    const chat = await operators[0]!.call<{ body: string; filtered: boolean }>('council:chat', {
      channel: 'COUNCIL',
      body: 'you absolute shit liar',
    });
    assert.equal(chat.ok, true, JSON.stringify(chat));
    // Filtered server-side, before fan-out, so no client ever holds the
    // unfiltered text.
    assert.equal((chat as { data: { filtered: boolean } }).data.filtered, true);
    assert.equal((chat as { data: { body: string } }).data.body.includes('shit'), false);

    assert.ok(
      await sockets[1]!.until(() => sockets[1]!.all('council:chat').length > 0),
      'council chat did not reach the other players',
    );

    /* ------------------------------------------------ voting - */

    assert.ok(await waitForPhase(sockets[0]!, 'VOTING'), 'voting never opened');

    const meetingId = sockets[0]!.latest<{ meeting: { id: string } | null }>('game:state')!.meeting!
      .id;
    const saboteurId = (saboteur as TestSocket & { me: { id: string } }).me.id;

    const firstVote = await operators[0]!.call('council:vote', { meetingId, target: saboteurId });
    assert.equal(firstVote.ok, true, JSON.stringify(firstVote));

    const secondVote = await operators[0]!.call('council:vote', { meetingId, target: saboteurId });
    assert.equal((secondVote as { code: string }).code, 'ALREADY_VOTED');

    await operators[1]!.call('council:vote', { meetingId, target: saboteurId });
    await operators[2]!.call('council:vote', { meetingId, target: saboteurId });
    await saboteur.call('council:vote', { meetingId, target: 'SKIP' });

    assert.ok(
      await sockets[0]!.until(() => sockets[0]!.latest('council:result') !== undefined),
      'the voting result was never broadcast',
    );

    const result = sockets[0]!.latest<{
      outcome: string;
      ejectedId: string;
      ejectedRole: string | null;
    }>('council:result')!;

    assert.equal(result.outcome, 'EJECTED');
    assert.equal(result.ejectedId, saboteurId);
    assert.equal(result.ejectedRole, 'SABOTEUR', 'confirmEjection is on, so the role is revealed');

    /* ------------------------------------------------ outcome - */

    assert.ok(
      await sockets[0]!.until(() => sockets[0]!.latest('game:result') !== undefined, 60_000),
      'the match never produced a result',
    );

    const final = sockets[0]!.latest<{
      winner: string;
      reason: string;
      players: Array<{ role: string; xpEarned: number; appearance: unknown }>;
    }>('game:result')!;

    assert.equal(final.winner, 'OPERATORS');
    assert.equal(final.reason, 'SABOTEURS_ELIMINATED');
    assert.ok(final.players.every((p) => p.role), 'roles are public once a match ends');
    assert.ok(final.players.every((p) => p.xpEarned > 0), 'somebody earned no XP');
    assert.ok(final.players.every((p) => p.appearance), 'the results screen cannot draw a player');

    /* ---------------------------------------------- persisted - */

    const account = await server.rest<{
      xp: number;
      stats: { matchesPlayed: number };
      achievements: Array<{ id: string }>;
    }>('/api/users/me', { token: host.token });

    assert.ok(account.json!.data.xp > 0, 'XP was not written to the account');
    assert.equal(account.json!.data.stats.matchesPlayed, 1);
    assert.ok(
      account.json!.data.achievements.some((a) => a.id === 'FIRST_MATCH'),
      'the first-match achievement did not unlock',
    );

    const history = await server.rest<{ items: Array<{ winner: string }> }>('/api/matches', {
      token: host.token,
    });
    assert.equal(history.json!.data.items.length, 1);
    assert.equal(history.json!.data.items[0]!.winner, 'OPERATORS');

    const board = await server.rest<{ items: Array<{ id: string }> }>(
      '/api/leaderboard?scope=WORLD',
      { token: host.token },
    );
    assert.ok(board.json!.data.items.length >= 4);
    assert.equal(
      JSON.stringify(board.json!.data.items).includes('@'),
      false,
      'the leaderboard leaked an email address',
    );
  });
});
