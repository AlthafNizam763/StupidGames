import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import { ConnectionState, ErrorCode, GamePhase } from '@voidline/shared';
import { roomManager } from '../game/RoomManager';
import { AppError } from '../lib/AppError';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from '../test/dbHarness';
import { authService } from './authService';
import { lobbyService } from './lobbyService';
import { roomService } from './roomService';

async function expectAppError(run: () => unknown | Promise<unknown>): Promise<AppError> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof AppError, `expected AppError, got ${String(error)}`);
    return error;
  }
  assert.fail('expected the call to throw');
}

let seq = 0;
async function makePlayer() {
  seq += 1;
  const { session } = await authService.register({
    username: `Crew_${seq}`,
    email: `crew${seq}@voidline.test`,
    password: 'correct horse battery',
  });
  return session.user;
}

describe('lobbyService', { timeout: 120_000 }, () => {
  before(async () => {
    await startTestDatabase();
  });
  after(async () => {
    roomManager.stop();
    await stopTestDatabase();
  });
  afterEach(async () => {
    roomManager.clear();
    await clearTestDatabase();
  });

  /** A room with its host seated and connected, plus `extra` joined players. */
  async function setUpRoom(extra = 0) {
    const host = await makePlayer();
    const created = await roomService.create(host.id, {
      name: 'Deck Nine',
      maxPlayers: 8,
      saboteurCount: 1,
    });
    await lobbyService.join(host.id, created.code);

    const guests = [];
    for (let i = 0; i < extra; i++) {
      const guest = await makePlayer();
      await lobbyService.join(guest.id, created.code);
      guests.push(guest);
    }

    return { host, guests, room: roomManager.getById(created.id)!, code: created.code };
  }

  describe('join', () => {
    it('seats a player and marks them connected', async () => {
      const { room, guests } = await setUpRoom(1);
      assert.equal(room.members.size, 2);
      assert.equal(room.members.get(guests[0]!.id)?.connection, ConnectionState.CONNECTED);
    });

    it('makes a joiner not-ready but the host ready', async () => {
      const { room, host, guests } = await setUpRoom(1);
      assert.equal(room.members.get(host.id)?.isReady, true);
      assert.equal(room.members.get(guests[0]!.id)?.isReady, false);
    });

    it('is idempotent — rejoining does not create a second seat', async () => {
      const { room, guests, code } = await setUpRoom(1);
      const result = await lobbyService.join(guests[0]!.id, code);

      assert.equal(result.resumed, true);
      assert.equal(room.members.size, 2);
    });

    it('lets an existing member back in even when the room is full', async () => {
      const host = await makePlayer();
      const created = await roomService.create(host.id, {
        name: 'Small',
        maxPlayers: 4,
        saboteurCount: 1,
      });
      await lobbyService.join(host.id, created.code);
      for (let i = 0; i < 3; i++) {
        const guest = await makePlayer();
        await lobbyService.join(guest.id, created.code);
      }

      // A dropped connection must not become an ejection just because others
      // filled the room in the meantime.
      const result = await lobbyService.join(host.id, created.code);
      assert.equal(result.resumed, true);
    });

    it('refuses a newcomer once the room is full', async () => {
      const host = await makePlayer();
      const created = await roomService.create(host.id, {
        name: 'Small',
        maxPlayers: 4,
        saboteurCount: 1,
      });
      await lobbyService.join(host.id, created.code);
      for (let i = 0; i < 3; i++) {
        await lobbyService.join((await makePlayer()).id, created.code);
      }

      const latecomer = await makePlayer();
      const error = await expectAppError(() => lobbyService.join(latecomer.id, created.code));
      assert.equal(error.code, ErrorCode.ROOM_FULL);
    });

    it('refuses a newcomer once the match is under way', async () => {
      const { room, code } = await setUpRoom(0);
      roomManager.setPhase(room, GamePhase.STARTING);

      const latecomer = await makePlayer();
      const error = await expectAppError(() => lobbyService.join(latecomer.id, code));
      assert.equal(error.code, ErrorCode.ROOM_IN_PROGRESS);
    });

    it('drops a player from their previous room when they join another', async () => {
      const { code: firstCode } = await setUpRoom(0);
      const wanderer = await makePlayer();
      await lobbyService.join(wanderer.id, firstCode);

      const otherHost = await makePlayer();
      const second = await roomService.create(otherHost.id, { name: 'Second Room' });
      await lobbyService.join(wanderer.id, second.code);

      // One identity, one seat. Two tabs must not put the same person in two
      // rooms and give a match a player who is not there.
      assert.equal(roomManager.findRoomsForUser(wanderer.id).length, 1);
    });
  });

  describe('ready', () => {
    it('lets a guest toggle ready', async () => {
      const { room, guests, code } = await setUpRoom(1);
      const guestId = guests[0]!.id;

      lobbyService.setReady(guestId, room.id, true);
      assert.equal(room.members.get(guestId)?.isReady, true);

      lobbyService.setReady(guestId, room.id, false);
      assert.equal(room.members.get(guestId)?.isReady, false);
      assert.ok(code);
    });

    it('ignores an attempt to un-ready the host', async () => {
      const { room, host } = await setUpRoom(1);

      // The host starts the match, so "ready" is not a state they occupy.
      lobbyService.setReady(host.id, room.id, false);
      assert.equal(room.members.get(host.id)?.isReady, true);
    });

    it('refuses a player who is not in the room', async () => {
      const { room } = await setUpRoom(0);
      const outsider = await makePlayer();

      const error = await expectAppError(() =>
        lobbyService.setReady(outsider.id, room.id, true),
      );
      assert.equal(error.code, ErrorCode.NOT_IN_ROOM);
    });

    it('refuses once the match has left the lobby', async () => {
      const { room, guests } = await setUpRoom(1);
      roomManager.setPhase(room, GamePhase.STARTING);

      const error = await expectAppError(() =>
        lobbyService.setReady(guests[0]!.id, room.id, true),
      );
      assert.equal(error.code, ErrorCode.WRONG_PHASE);
    });
  });

  describe('kick', () => {
    it('lets the host remove a player', async () => {
      const { room, host, guests } = await setUpRoom(1);
      lobbyService.kick(host.id, room.id, guests[0]!.id);
      assert.equal(room.members.has(guests[0]!.id), false);
    });

    it('refuses a non-host', async () => {
      const { room, host, guests } = await setUpRoom(2);
      const error = await expectAppError(() =>
        lobbyService.kick(guests[0]!.id, room.id, guests[1]!.id),
      );
      assert.equal(error.code, ErrorCode.NOT_HOST);
      assert.ok(host);
    });

    it('refuses the host kicking themselves', async () => {
      const { room, host } = await setUpRoom(1);
      const error = await expectAppError(() => lobbyService.kick(host.id, room.id, host.id));
      assert.equal(error.code, ErrorCode.TARGET_INVALID);
    });

    it('refuses an unknown target', async () => {
      const { room, host } = await setUpRoom(1);
      const stranger = await makePlayer();
      const error = await expectAppError(() => lobbyService.kick(host.id, room.id, stranger.id));
      assert.equal(error.code, ErrorCode.TARGET_INVALID);
    });
  });

  describe('leave and host transfer', () => {
    it('frees the seat immediately', async () => {
      const { room, guests } = await setUpRoom(1);
      lobbyService.leave(guests[0]!.id, room.id);
      assert.equal(room.members.has(guests[0]!.id), false);
    });

    it('hands the room to the longest-seated connected player', async () => {
      const { room, host, guests } = await setUpRoom(2);
      lobbyService.leave(host.id, room.id);

      assert.equal(room.hostId, guests[0]!.id);
      assert.equal(room.members.get(guests[0]!.id)?.isHost, true);
      // A new host is ready by definition - they are the one who starts.
      assert.equal(room.members.get(guests[0]!.id)?.isReady, true);
    });

    it('skips a disconnected candidate when choosing a new host', async () => {
      const { room, host, guests } = await setUpRoom(2);
      roomManager.setConnection(room, guests[0]!.id, ConnectionState.RECONNECTING);

      lobbyService.leave(host.id, room.id);
      assert.equal(room.hostId, guests[1]!.id);
    });

    it('closes the room when the last player leaves', async () => {
      const { room, host } = await setUpRoom(0);
      lobbyService.leave(host.id, room.id);
      assert.equal(roomManager.getById(room.id), null);
    });

    it('closes the room when the host leaves and nobody is connected', async () => {
      const { room, host, guests } = await setUpRoom(1);
      roomManager.setConnection(room, guests[0]!.id, ConnectionState.RECONNECTING);

      // Nobody to hand it to and nobody to notice it go.
      lobbyService.leave(host.id, room.id);
      assert.equal(roomManager.getById(room.id), null);
    });
  });

  describe('reconnect grace', () => {
    it('releases the seat when the grace period expires', async () => {
      const { room, guests } = await setUpRoom(1);
      lobbyService.setConnection(guests[0]!.id, room.id, ConnectionState.RECONNECTING);

      lobbyService.expireGrace(guests[0]!.id, room.id);
      assert.equal(room.members.has(guests[0]!.id), false);
    });

    it('does nothing if the player already came back', async () => {
      const { room, guests } = await setUpRoom(1);
      lobbyService.setConnection(guests[0]!.id, room.id, ConnectionState.RECONNECTING);
      lobbyService.setConnection(guests[0]!.id, room.id, ConnectionState.CONNECTED);

      // A timer set before the reconnect must not evict them after it.
      lobbyService.expireGrace(guests[0]!.id, room.id);
      assert.equal(room.members.has(guests[0]!.id), true);
    });
  });

  describe('start preconditions', () => {
    it('blocks a non-host', async () => {
      const { room, guests } = await setUpRoom(3);
      const blocker = lobbyService.startBlocker(room, guests[0]!.id);
      assert.equal(blocker?.code, ErrorCode.NOT_HOST);
    });

    it('blocks too few connected players', async () => {
      const { room, host } = await setUpRoom(1);
      const blocker = lobbyService.startBlocker(room, host.id);
      assert.equal(blocker?.code, ErrorCode.NOT_ENOUGH_PLAYERS);
    });

    it('counts only connected players toward the minimum', async () => {
      const { room, host, guests } = await setUpRoom(3);
      for (const guest of guests) lobbyService.setReady(guest.id, room.id, true);

      // Four seats but one is a dropped connection: three players cannot start.
      roomManager.setConnection(room, guests[0]!.id, ConnectionState.RECONNECTING);
      const blocker = lobbyService.startBlocker(room, host.id);
      assert.equal(blocker?.code, ErrorCode.NOT_ENOUGH_PLAYERS);
    });

    it('blocks players who are not ready, and names one of them', async () => {
      const { room, host, guests } = await setUpRoom(3);
      lobbyService.setReady(guests[0]!.id, room.id, true);
      lobbyService.setReady(guests[1]!.id, room.id, true);

      const blocker = lobbyService.startBlocker(room, host.id);
      assert.equal(blocker?.code, ErrorCode.PLAYERS_NOT_READY);
      assert.match(blocker!.message, new RegExp(guests[2]!.username));
    });

    it('clears once everyone is ready', async () => {
      const { room, host, guests } = await setUpRoom(3);
      for (const guest of guests) lobbyService.setReady(guest.id, room.id, true);

      assert.equal(lobbyService.startBlocker(room, host.id), null);
    });

    it('reports honestly that the match engine is not built', async () => {
      const { room, host, guests } = await setUpRoom(3);
      for (const guest of guests) lobbyService.setReady(guest.id, room.id, true);

      // Every precondition passes. Rather than move the room into a phase
      // nothing can advance, start says what is actually missing (Phase 12).
      const error = await expectAppError(() => lobbyService.start(host.id, room.id));
      assert.equal(error.code, ErrorCode.SERVICE_UNAVAILABLE);
      assert.equal(error.context?.readyToStart, true);
      assert.equal(room.phase, GamePhase.LOBBY, 'the room must be left in the lobby');
    });
  });
});
