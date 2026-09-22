import { randomInt, randomUUID } from 'node:crypto';
import {
  ConnectionState,
  GamePhase,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  ROOM_TEARDOWN_DELAY_MS,
  canTransition,
  type LobbyPlayer,
  type RoomCode,
  type RoomSettings,
  type RoomState,
  type UserId,
} from '@voidline/shared';
import { logger } from '../lib/logger';

/**
 * The in-memory room registry.
 *
 * Rooms are not persisted. A match is short-lived, chatty and latency
 * sensitive, and round-tripping its state to MongoDB on every tick would add
 * latency to the one thing that must not have it (DATABASE.md). Only the
 * finished match is written, once, at the end.
 *
 * The accepted costs, stated plainly:
 *
 * - a server restart loses every open room
 * - with more than one instance, a room lives on exactly one of them, which is
 *   why scaling out needs the Redis adapter *and* a shared room directory
 *   before it works at all (DEPLOYMENT.md)
 *
 * This class owns room *identity and membership*. It deliberately holds no game
 * rules: who may start a match, who may be eliminated and who has won are
 * decided by the managers added in Phases 12 onward.
 */

export interface Room {
  id: string;
  code: RoomCode;
  hostId: UserId;
  phase: GamePhase;
  settings: RoomSettings;
  /** Seats, keyed by user id. Insertion order is the lobby display order. */
  members: Map<UserId, LobbyPlayer>;
  matchId: string | null;
  createdAt: Date;
  /** Epoch ms of the last meaningful activity. Drives the idle reaper. */
  lastActivityAt: number;
}

/**
 * How long a room with nobody connected survives.
 *
 * Longer than the reconnect grace period, so a host who drops out and comes
 * back does not find their lobby gone; short enough that abandoned rooms do not
 * accumulate in memory.
 */
const IDLE_ROOM_TTL_MS = ROOM_TEARDOWN_DELAY_MS;

const REAPER_INTERVAL_MS = 30_000;

class RoomManagerImpl {
  private readonly rooms = new Map<string, Room>();
  /** Code to id. Lets a join look a room up without scanning every room. */
  private readonly codeIndex = new Map<RoomCode, string>();
  private reaper: NodeJS.Timeout | null = null;

  /* ------------------------------------------------------------ codes - */

  /**
   * Generates an unused room code.
   *
   * `randomInt` rather than `Math.random`: codes are the only thing standing
   * between a private room and anyone who guesses one, and a predictable
   * sequence would make them enumerable.
   */
  private generateCode(): RoomCode {
    // With 31 characters and 6 places there are ~887 million codes, so a
    // collision is rare - but "rare" is not "never", and handing two rooms the
    // same code would put strangers in each other's lobbies.
    for (let attempt = 0; attempt < 10; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
      }
      if (!this.codeIndex.has(code)) return code;
    }

    throw new Error('Could not allocate a unique room code after 10 attempts');
  }

  /* ----------------------------------------------------------- create - */

  create(host: Omit<LobbyPlayer, 'isHost' | 'isReady' | 'connection' | 'joinedAt'>, settings: RoomSettings): Room {
    const code = this.generateCode();
    const now = Date.now();

    const hostSeat: LobbyPlayer = {
      ...host,
      isHost: true,
      // The host is always ready; they are the one who starts the match.
      isReady: true,
      /*
       * DISCONNECTED, not CONNECTED. Creating a room over REST does not open a
       * socket - the client does that next. Claiming the host is connected
       * before their socket exists would make the reaper think the room is
       * occupied and would show a phantom player in the lobby.
       */
      connection: ConnectionState.DISCONNECTED,
      joinedAt: new Date(now).toISOString(),
    };

    const room: Room = {
      id: randomUUID(),
      code,
      hostId: host.userId,
      phase: GamePhase.LOBBY,
      settings,
      members: new Map([[host.userId, hostSeat]]),
      matchId: null,
      createdAt: new Date(now),
      lastActivityAt: now,
    };

    this.rooms.set(room.id, room);
    this.codeIndex.set(code, room.id);
    this.ensureReaper();

    logger.info({ roomId: room.id, code, hostId: host.userId }, 'room created');
    return room;
  }

  /* ------------------------------------------------------------ reads - */

  getById(id: string): Room | null {
    return this.rooms.get(id) ?? null;
  }

  getByCode(code: RoomCode): Room | null {
    // Codes are displayed and typed in uppercase; accept either.
    const id = this.codeIndex.get(code.toUpperCase());
    return id ? (this.rooms.get(id) ?? null) : null;
  }

  /** Every room this user currently holds a seat in. */
  findRoomsForUser(userId: UserId): Room[] {
    return [...this.rooms.values()].filter((room) => room.members.has(userId));
  }

  get size(): number {
    return this.rooms.size;
  }

  /* ---------------------------------------------------------- mutation - */

  /** Marks a room as active, so the idle reaper leaves it alone. */
  touch(room: Room): void {
    room.lastActivityAt = Date.now();
  }

  /**
   * Moves a room to a new phase, refusing transitions the state machine does
   * not allow (§27). Returns false rather than throwing so a caller can decide
   * whether an illegal transition is a bug or a race.
   */
  setPhase(room: Room, phase: GamePhase): boolean {
    if (!canTransition(room.phase, phase)) {
      logger.error(
        { roomId: room.id, from: room.phase, to: phase },
        'refused an illegal phase transition',
      );
      return false;
    }
    room.phase = phase;
    this.touch(room);
    return true;
  }

  /* --------------------------------------------------- membership - */

  /**
   * Seats a player, or returns their existing seat.
   *
   * Idempotent on purpose: a reconnecting player runs the same path as a new
   * one, and the difference between "joining" and "coming back" is whether a
   * seat already exists - not something the client gets to assert.
   */
  addMember(
    room: Room,
    player: Omit<LobbyPlayer, 'isHost' | 'isReady' | 'connection' | 'joinedAt'>,
  ): LobbyPlayer {
    const existing = room.members.get(player.userId);

    if (existing) {
      existing.connection = ConnectionState.CONNECTED;
      // Refresh the display fields: they may have changed their name or suit
      // since they were last here.
      existing.username = player.username;
      existing.avatar = player.avatar;
      existing.level = player.level;
      this.touch(room);
      return existing;
    }

    const seat: LobbyPlayer = {
      ...player,
      isHost: room.hostId === player.userId,
      // The host is always ready; they are the one who starts the match.
      isReady: room.hostId === player.userId,
      connection: ConnectionState.CONNECTED,
      joinedAt: new Date().toISOString(),
    };

    room.members.set(player.userId, seat);
    this.touch(room);
    return seat;
  }

  removeMember(room: Room, userId: UserId): boolean {
    const removed = room.members.delete(userId);
    if (removed) this.touch(room);
    return removed;
  }

  setConnection(room: Room, userId: UserId, connection: ConnectionState): void {
    const member = room.members.get(userId);
    if (!member) return;
    member.connection = connection;
    this.touch(room);
  }

  setReady(room: Room, userId: UserId, ready: boolean): void {
    const member = room.members.get(userId);
    // The host's readiness is not theirs to toggle - they start the match, so
    // "ready" would be a checkbox that means nothing.
    if (!member || member.isHost) return;
    member.isReady = ready;
    this.touch(room);
  }

  /**
   * Hands the room to somebody else.
   *
   * Picks the longest-seated connected member, which is the closest thing to
   * "who has been here and is still here". Returns null when nobody qualifies,
   * and the caller then closes the room.
   */
  transferHost(room: Room): LobbyPlayer | null {
    const candidate = [...room.members.values()]
      .filter((member) => member.userId !== room.hostId)
      .filter((member) => member.connection === ConnectionState.CONNECTED)
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))[0];

    if (!candidate) return null;

    const previous = room.members.get(room.hostId);
    if (previous) previous.isHost = false;

    room.hostId = candidate.userId;
    candidate.isHost = true;
    // A new host is ready by definition, since they are the one who starts.
    candidate.isReady = true;

    this.touch(room);
    logger.info({ roomId: room.id, hostId: candidate.userId }, 'host transferred');

    return candidate;
  }

  close(room: Room, reason: string): void {
    this.rooms.delete(room.id);
    this.codeIndex.delete(room.code);
    logger.info({ roomId: room.id, code: room.code, reason }, 'room closed');
  }

  /* ------------------------------------------------------------ reaper - */

  private ensureReaper(): void {
    if (this.reaper) return;

    this.reaper = setInterval(() => this.reapIdleRooms(), REAPER_INTERVAL_MS);
    // A sweep timer must not be the reason the process refuses to exit.
    this.reaper.unref();
  }

  /**
   * Closes rooms that nobody is connected to and nothing has happened in.
   *
   * Without this, every abandoned lobby - a created room whose host closed the
   * tab, a match nobody finished - stays in memory until the process restarts.
   */
  reapIdleRooms(now = Date.now()): number {
    let closed = 0;

    for (const room of [...this.rooms.values()]) {
      const anyoneConnected = [...room.members.values()].some(
        (member) => member.connection === ConnectionState.CONNECTED,
      );
      if (anyoneConnected) continue;

      if (now - room.lastActivityAt >= IDLE_ROOM_TTL_MS) {
        this.close(room, 'idle');
        closed++;
      }
    }

    return closed;
  }

  /** Stops the sweep timer. Used by tests and by graceful shutdown. */
  stop(): void {
    if (this.reaper) {
      clearInterval(this.reaper);
      this.reaper = null;
    }
  }

  /** Test helper. Never called in production code. */
  clear(): void {
    this.rooms.clear();
    this.codeIndex.clear();
  }
}

export const roomManager = new RoomManagerImpl();
export type RoomManager = RoomManagerImpl;

/* ------------------------------------------------------- serialisation - */

/**
 * The full lobby view, for players who are in the room.
 *
 * Safe to broadcast inside a room: a lobby holds no secrets, because roles do
 * not exist until the match starts. The moment they do, this shape stops being
 * the right one - `GameSnapshot` takes over, and it has no role field at all.
 */
export function toRoomState(room: Room): RoomState {
  return {
    id: room.id,
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    settings: room.settings,
    players: [...room.members.values()],
    matchId: room.matchId,
    createdAt: room.createdAt.toISOString(),
  };
}
