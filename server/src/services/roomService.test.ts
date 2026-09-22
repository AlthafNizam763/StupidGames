import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import {
  ConnectionState,
  DEFAULT_APPEARANCE,
  DEFAULT_ROOM_SETTINGS,
  ErrorCode,
  GamePhase,
  ROOM_CODE_PATTERN,
  ROOM_TEARDOWN_DELAY_MS,
} from '@voidline/shared';
import { roomManager } from '../game/RoomManager';
import { AppError } from '../lib/AppError';
import { clearTestDatabase, startTestDatabase, stopTestDatabase } from '../test/dbHarness';
import { authService } from './authService';
import { roomService } from './roomService';

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
async function makePlayer() {
  seq += 1;
  const { session } = await authService.register({
    username: `Crew_${seq}`,
    email: `crew${seq}@voidline.test`,
    password: 'correct horse battery',
  });
  return session.user;
}

describe('roomService', { timeout: 120_000 }, () => {
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

  describe('create', () => {
    it('creates a room with the caller as host', async () => {
      const host = await makePlayer();
      const room = await roomService.create(host.id, { name: 'Deck Nine' });

      assert.equal(room.hostId, host.id);
      assert.equal(room.phase, GamePhase.LOBBY);
      assert.equal(room.settings.name, 'Deck Nine');
      assert.equal(room.players.length, 1);
      assert.equal(room.players[0]?.isHost, true);
    });

    it('issues a code from the unambiguous alphabet', async () => {
      const host = await makePlayer();
      const room = await roomService.create(host.id, { name: 'Deck Nine' });

      assert.match(room.code, ROOM_CODE_PATTERN);
      // 0/O and 1/I/L are excluded so a code read aloud is unambiguous.
      assert.equal(/[01OIL]/.test(room.code), false, `code ${room.code} contains a lookalike`);
    });

    it('issues distinct codes across many rooms', async () => {
      const host = await makePlayer();
      const codes = new Set<string>();

      for (let i = 0; i < 40; i++) {
        const room = roomManager.create(
          { userId: `u${i}`, username: `u${i}`, avatar: 'operator-01', appearance: DEFAULT_APPEARANCE, level: 1 },
          { ...DEFAULT_ROOM_SETTINGS, name: 'Room', map: 'ORBITAL_09', isPrivate: true },
        );
        codes.add(room.code);
      }

      assert.equal(codes.size, 40, 'room codes collided');
      assert.ok(host);
    });

    it('applies the documented defaults', async () => {
      const host = await makePlayer();
      const room = await roomService.create(host.id, { name: 'Deck Nine' });

      assert.equal(room.settings.maxPlayers, 8);
      assert.equal(room.settings.saboteurCount, 2);
      assert.equal(room.settings.objectiveCount, 7);
      assert.equal(room.settings.discussionTime, 45);
      assert.equal(room.settings.votingTime, 30);
      assert.equal(room.settings.killCooldown, 25);
    });

    it('applies the rapid preset', async () => {
      const host = await makePlayer();
      const room = await roomService.create(host.id, { name: 'Fast Run', gameMode: 'RAPID' });

      assert.equal(room.settings.killCooldown, 15);
      assert.equal(room.settings.objectiveCount, 4);
    });

    it('refuses saboteurs at or above parity', async () => {
      const host = await makePlayer();

      // 3 saboteurs among 4 players is a match that is over on the first tick.
      const error = await expectAppError(() =>
        roomService.create(host.id, { name: 'Doomed', maxPlayers: 4, saboteurCount: 3 }),
      );
      assert.equal(error.code, ErrorCode.INVALID_SETTINGS);
      assert.equal(error.fieldErrors[0]?.path, 'saboteurCount');
    });

    it('refuses a name that is too short', async () => {
      const host = await makePlayer();
      const error = await expectAppError(() => roomService.create(host.id, { name: 'ab' }));
      assert.equal(error.code, ErrorCode.INVALID_SETTINGS);
    });

    it('replaces an abandoned room from the same host', async () => {
      const host = await makePlayer();
      const first = await roomService.create(host.id, { name: 'First Room' });
      const second = await roomService.create(host.id, { name: 'Second Room' });

      // The first had nobody connected, so it is cleaned up rather than left
      // for the reaper.
      assert.equal(roomManager.getByCode(first.code), null);
      assert.ok(roomManager.getByCode(second.code));
    });

    it('refuses a second room when the first still has people in it', async () => {
      const host = await makePlayer();
      const guest = await makePlayer();
      const first = await roomService.create(host.id, { name: 'First Room' });

      // Simulates a guest who has taken a seat over the socket (Phase 8).
      const room = roomManager.getByCode(first.code)!;
      room.members.set(guest.id, {
        userId: guest.id,
        username: guest.username,
        avatar: guest.avatar,
        appearance: DEFAULT_APPEARANCE,
        level: guest.level,
        isHost: false,
        isReady: false,
        connection: ConnectionState.CONNECTED,
        joinedAt: new Date().toISOString(),
      });

      const error = await expectAppError(() =>
        roomService.create(host.id, { name: 'Second Room' }),
      );
      assert.equal(error.code, ErrorCode.ALREADY_IN_ROOM);
      // And the original is untouched - closing it would eject the guest.
      assert.ok(roomManager.getByCode(first.code));
    });
  });

  describe('preview', () => {
    it('finds a room by code', async () => {
      const host = await makePlayer();
      const created = await roomService.create(host.id, { name: 'Deck Nine' });

      const summary = await roomService.preview(created.code);
      assert.equal(summary.name, 'Deck Nine');
      assert.equal(summary.host.username, host.username);
      assert.equal(summary.playerCount, 1);
      assert.equal(summary.isJoinable, true);
    });

    it('accepts a lowercase code', async () => {
      const host = await makePlayer();
      const created = await roomService.create(host.id, { name: 'Deck Nine' });

      const summary = await roomService.preview(created.code.toLowerCase());
      assert.equal(summary.code, created.code);
    });

    it('never exposes the roster', async () => {
      const host = await makePlayer();
      const created = await roomService.create(host.id, { name: 'Deck Nine' });
      const summary = await roomService.preview(created.code);

      // A code is a weak secret. Anyone who guesses one should learn that a
      // room exists, not who is sitting in it.
      assert.equal('players' in summary, false);
      assert.equal(typeof summary.playerCount, 'number');
    });

    it('rejects a malformed code before looking anything up', async () => {
      const error = await expectAppError(() => roomService.preview('!!!'));
      assert.equal(error.code, ErrorCode.INVALID_ROOM_CODE);
    });

    it('rejects a code containing excluded lookalike characters', async () => {
      const error = await expectAppError(() => roomService.preview('AAA0AA'));
      assert.equal(error.code, ErrorCode.INVALID_ROOM_CODE);
    });

    it('reports an unknown code as not found', async () => {
      const error = await expectAppError(() => roomService.preview('ZZZZZZ'));
      assert.equal(error.code, ErrorCode.ROOM_NOT_FOUND);
    });
  });

  describe('checkJoinable', () => {
    it('allows joining an open room', async () => {
      const host = await makePlayer();
      const guest = await makePlayer();
      const created = await roomService.create(host.id, { name: 'Deck Nine' });

      const summary = await roomService.checkJoinable(guest.id, created.code);
      assert.equal(summary.isJoinable, true);
    });

    it('refuses a full room', async () => {
      const host = await makePlayer();
      const guest = await makePlayer();
      const created = await roomService.create(host.id, { name: 'Deck Nine', maxPlayers: 4, saboteurCount: 1 });
      const room = roomManager.getByCode(created.code)!;

      for (let i = 0; i < 3; i++) {
        room.members.set(`filler-${i}`, {
          userId: `filler-${i}`,
          username: `Filler${i}`,
          avatar: 'operator-01',
          appearance: DEFAULT_APPEARANCE,
          level: 1,
          isHost: false,
          isReady: false,
          connection: ConnectionState.CONNECTED,
          joinedAt: new Date().toISOString(),
        });
      }

      const error = await expectAppError(() => roomService.checkJoinable(guest.id, created.code));
      assert.equal(error.code, ErrorCode.ROOM_FULL);
    });

    it('refuses a match already in progress', async () => {
      const host = await makePlayer();
      const guest = await makePlayer();
      const created = await roomService.create(host.id, { name: 'Deck Nine' });
      const room = roomManager.getByCode(created.code)!;

      roomManager.setPhase(room, GamePhase.STARTING);
      roomManager.setPhase(room, GamePhase.PLAYING);

      const error = await expectAppError(() => roomService.checkJoinable(guest.id, created.code));
      assert.equal(error.code, ErrorCode.ROOM_IN_PROGRESS);
    });

    it('lets an existing member back in even when the room is full', async () => {
      const host = await makePlayer();
      const created = await roomService.create(host.id, { name: 'Deck Nine', maxPlayers: 4, saboteurCount: 1 });
      const room = roomManager.getByCode(created.code)!;

      for (let i = 0; i < 3; i++) {
        room.members.set(`filler-${i}`, {
          userId: `filler-${i}`,
          username: `Filler${i}`,
          avatar: 'operator-01',
          appearance: DEFAULT_APPEARANCE,
          level: 1,
          isHost: false,
          isReady: false,
          connection: ConnectionState.CONNECTED,
          joinedAt: new Date().toISOString(),
        });
      }

      // The host already holds a seat; a full room must not lock them out of
      // the room they are hosting.
      const summary = await roomService.checkJoinable(host.id, created.code);
      assert.equal(summary.playerCount, 4);
    });
  });

  describe('getState', () => {
    it('gives the full lobby to a member', async () => {
      const host = await makePlayer();
      const created = await roomService.create(host.id, { name: 'Deck Nine' });

      const state = await roomService.getState(host.id, created.id);
      assert.equal(state.players.length, 1);
    });

    it('refuses a non-member', async () => {
      const host = await makePlayer();
      const outsider = await makePlayer();
      const created = await roomService.create(host.id, { name: 'Deck Nine' });

      const error = await expectAppError(() => roomService.getState(outsider.id, created.id));
      assert.equal(error.code, ErrorCode.NOT_IN_ROOM);
    });
  });

  describe('updateSettings', () => {
    it('lets the host change settings', async () => {
      const host = await makePlayer();
      const created = await roomService.create(host.id, { name: 'Deck Nine' });

      const updated = await roomService.updateSettings(host.id, created.id, {
        discussionTime: 90,
      });
      assert.equal(updated.settings.discussionTime, 90);
    });

    it('refuses a non-host', async () => {
      const host = await makePlayer();
      const guest = await makePlayer();
      const created = await roomService.create(host.id, { name: 'Deck Nine' });

      const error = await expectAppError(() =>
        roomService.updateSettings(guest.id, created.id, { discussionTime: 90 }),
      );
      assert.equal(error.code, ErrorCode.NOT_HOST);
    });

    it('re-validates every field, not just the changed one', async () => {
      const host = await makePlayer();
      const created = await roomService.create(host.id, {
        name: 'Deck Nine',
        maxPlayers: 10,
        saboteurCount: 3,
      });

      // 3 saboteurs was legal at 10 players and is not at 5. Validating only
      // the field that changed would let this through.
      const error = await expectAppError(() =>
        roomService.updateSettings(host.id, created.id, { maxPlayers: 5 }),
      );
      assert.equal(error.code, ErrorCode.INVALID_SETTINGS);
      assert.equal(error.fieldErrors[0]?.path, 'saboteurCount');
    });

    it('refuses to shrink a room below the players already in it', async () => {
      const host = await makePlayer();
      const created = await roomService.create(host.id, { name: 'Deck Nine', maxPlayers: 10 });
      const room = roomManager.getByCode(created.code)!;

      for (let i = 0; i < 5; i++) {
        room.members.set(`filler-${i}`, {
          userId: `filler-${i}`,
          username: `Filler${i}`,
          avatar: 'operator-01',
          appearance: DEFAULT_APPEARANCE,
          level: 1,
          isHost: false,
          isReady: false,
          connection: ConnectionState.CONNECTED,
          joinedAt: new Date().toISOString(),
        });
      }

      const error = await expectAppError(() =>
        roomService.updateSettings(host.id, created.id, { maxPlayers: 4 }),
      );
      assert.equal(error.fieldErrors[0]?.path, 'maxPlayers');
    });

    it('refuses once the match has started', async () => {
      const host = await makePlayer();
      const created = await roomService.create(host.id, { name: 'Deck Nine' });
      const room = roomManager.getByCode(created.code)!;

      roomManager.setPhase(room, GamePhase.STARTING);

      const error = await expectAppError(() =>
        roomService.updateSettings(host.id, created.id, { discussionTime: 90 }),
      );
      assert.equal(error.code, ErrorCode.WRONG_PHASE);
    });
  });

  describe('close', () => {
    it('lets the host close the room', async () => {
      const host = await makePlayer();
      const created = await roomService.create(host.id, { name: 'Deck Nine' });

      await roomService.close(host.id, created.id);
      assert.equal(roomManager.getById(created.id), null);
    });

    it('refuses anyone else', async () => {
      const host = await makePlayer();
      const guest = await makePlayer();
      const created = await roomService.create(host.id, { name: 'Deck Nine' });

      const error = await expectAppError(() => roomService.close(guest.id, created.id));
      assert.equal(error.code, ErrorCode.NOT_HOST);
      assert.ok(roomManager.getById(created.id));
    });
  });

  describe('phase transitions', () => {
    it('refuses a transition the state machine does not allow', async () => {
      const host = await makePlayer();
      const created = await roomService.create(host.id, { name: 'Deck Nine' });
      const room = roomManager.getById(created.id)!;

      // LOBBY -> VOTING is not a legal edge; it must be refused rather than
      // silently corrected, or the room desyncs with no trace.
      assert.equal(roomManager.setPhase(room, GamePhase.VOTING), false);
      assert.equal(room.phase, GamePhase.LOBBY);

      assert.equal(roomManager.setPhase(room, GamePhase.STARTING), true);
      assert.equal(room.phase, GamePhase.STARTING);
    });
  });

  describe('idle reaper', () => {
    it('closes a room nobody is connected to', async () => {
      const host = await makePlayer();
      const created = await roomService.create(host.id, { name: 'Deck Nine' });

      // Just short of the TTL: still alive.
      assert.equal(roomManager.reapIdleRooms(Date.now() + ROOM_TEARDOWN_DELAY_MS - 1000), 0);
      assert.ok(roomManager.getById(created.id));

      assert.equal(roomManager.reapIdleRooms(Date.now() + ROOM_TEARDOWN_DELAY_MS + 1000), 1);
      assert.equal(roomManager.getById(created.id), null);
    });

    it('leaves a room alone while anyone is connected', async () => {
      const host = await makePlayer();
      const created = await roomService.create(host.id, { name: 'Deck Nine' });
      const room = roomManager.getById(created.id)!;

      room.members.get(host.id)!.connection = ConnectionState.CONNECTED;

      assert.equal(roomManager.reapIdleRooms(Date.now() + ROOM_TEARDOWN_DELAY_MS * 10), 0);
      assert.ok(roomManager.getById(created.id));
    });
  });
});
