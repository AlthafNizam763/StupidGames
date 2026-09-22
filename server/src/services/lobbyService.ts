import {
  ConnectionState,
  ErrorCode,
  GamePhase,
  isLobbyPhase,
  MIN_PLAYERS_TO_START,
  ROOM_CODE_PATTERN,
  type RoomState,
} from '@voidline/shared';
import { AppError } from '../lib/AppError';
import { logger } from '../lib/logger';
import { roomManager, toRoomState, type Room } from '../game/RoomManager';
import { toPublicUser, userRepository } from '../repositories/UserRepository';

/**
 * Lobby membership rules.
 *
 * Framework-free, like every other service: nothing here imports Socket.IO, so
 * each rule is testable without opening a connection. The socket handlers are a
 * thin translation layer over these functions.
 *
 * The recurring principle is that a client asks and the server decides. A
 * `room:ready` message means "I would like to be marked ready", never "I am
 * ready" - and the server is the one that knows whether the phase even allows
 * it.
 */

export interface JoinResult {
  room: Room;
  state: RoomState;
  /** True when this was a reconnect rather than a fresh join. */
  resumed: boolean;
}

async function loadPlayer(userId: string) {
  const user = await userRepository.findById(userId);
  if (!user) throw new AppError(ErrorCode.TOKEN_INVALID);
  if (user.disabled) throw new AppError(ErrorCode.ACCOUNT_DISABLED);

  return {
    userId: user.id as string,
    username: user.username,
    avatar: user.avatar,
    appearance: toPublicUser(user).appearance,
    level: user.level,
  };
}

function requireRoom(roomId: string | null): Room {
  if (!roomId) throw new AppError(ErrorCode.NOT_IN_ROOM);
  const room = roomManager.getById(roomId);
  if (!room) throw new AppError(ErrorCode.ROOM_NOT_FOUND);
  return room;
}

function requireHost(room: Room, userId: string): void {
  // Checked against the room's own record, never against anything the client
  // sent. This is the single most-repeated authorisation check in the lobby.
  if (room.hostId !== userId) throw new AppError(ErrorCode.NOT_HOST);
}

export const lobbyService = {
  /**
   * Takes a seat in a room.
   *
   * An existing member is always let back in, even into a full room or a match
   * in progress - they are returning to a seat that is already theirs, and
   * refusing them would turn a dropped connection into an ejection.
   */
  async join(userId: string, code: string): Promise<JoinResult> {
    const normalised = code.trim().toUpperCase();
    if (!ROOM_CODE_PATTERN.test(normalised)) throw new AppError(ErrorCode.INVALID_ROOM_CODE);

    const room = roomManager.getByCode(normalised);
    if (!room) throw new AppError(ErrorCode.ROOM_NOT_FOUND);

    const player = await loadPlayer(userId);
    const existing = room.members.get(userId);

    if (!existing) {
      if (room.phase === GamePhase.ENDED) throw new AppError(ErrorCode.ROOM_CLOSED);
      if (!isLobbyPhase(room.phase)) throw new AppError(ErrorCode.ROOM_IN_PROGRESS);
      if (room.members.size >= room.settings.maxPlayers) throw new AppError(ErrorCode.ROOM_FULL);

      /*
       * A player may hold only one seat. Without this, opening a second tab
       * would put the same person in two rooms - two sockets, one identity,
       * and a match that thinks it has an extra player.
       */
      for (const other of roomManager.findRoomsForUser(userId)) {
        if (other.id !== room.id) this.leave(userId, other.id, 'joined another room');
      }
    }

    roomManager.addMember(room, player);

    return { room, state: toRoomState(room), resumed: Boolean(existing) };
  },

  /**
   * Gives up a seat deliberately.
   *
   * Distinct from a disconnect: leaving is final and frees the seat at once,
   * where a dropped connection holds it for the grace period.
   */
  leave(userId: string, roomId: string, reason = 'left'): Room | null {
    const room = roomManager.getById(roomId);
    if (!room) return null;
    if (!room.members.has(userId)) return room;

    const wasHost = room.hostId === userId;
    roomManager.removeMember(room, userId);
    logger.info({ roomId: room.id, userId, reason }, 'player left room');

    if (room.members.size === 0) {
      roomManager.close(room, 'last player left');
      return null;
    }

    if (wasHost && !roomManager.transferHost(room)) {
      // Everybody who is left is disconnected, so there is nobody to hand the
      // room to and nobody to notice it going away.
      roomManager.close(room, 'host left and no connected player remains');
      return null;
    }

    return room;
  },

  setReady(userId: string, roomId: string, ready: boolean): RoomState {
    const room = requireRoom(roomId);
    if (!room.members.has(userId)) throw new AppError(ErrorCode.NOT_IN_ROOM);
    if (room.phase !== GamePhase.LOBBY) throw new AppError(ErrorCode.WRONG_PHASE);

    roomManager.setReady(room, userId, ready);
    return toRoomState(room);
  },

  /**
   * Removes a player. Host only.
   *
   * The kicked player is not banned - VOIDLINE has no ban list - so they can
   * rejoin with the code. Kicking is for clearing an idle seat, and a room that
   * needs more than that should be closed and recreated.
   */
  kick(userId: string, roomId: string, targetId: string): { state: RoomState; room: Room } {
    const room = requireRoom(roomId);
    requireHost(room, userId);

    if (targetId === room.hostId) {
      throw new AppError(ErrorCode.TARGET_INVALID, 'You cannot remove yourself.');
    }
    if (!room.members.has(targetId)) throw new AppError(ErrorCode.TARGET_INVALID);
    if (room.phase !== GamePhase.LOBBY) throw new AppError(ErrorCode.WRONG_PHASE);

    roomManager.removeMember(room, targetId);
    logger.info({ roomId: room.id, targetId }, 'player kicked');

    return { state: toRoomState(room), room };
  },

  closeRoom(userId: string, roomId: string): Room {
    const room = requireRoom(roomId);
    requireHost(room, userId);
    roomManager.close(room, 'closed by host');
    return room;
  },

  /**
   * Why the match cannot start, or null if it can.
   *
   * Returned rather than thrown so the lobby can render the reason next to a
   * disabled button. The host should be able to see *what is missing* without
   * pressing a button to find out.
   */
  startBlocker(room: Room, userId: string): { code: ErrorCode; message: string } | null {
    if (room.hostId !== userId) {
      return { code: ErrorCode.NOT_HOST, message: 'Only the host can start the match.' };
    }
    if (room.phase !== GamePhase.LOBBY) {
      return { code: ErrorCode.WRONG_PHASE, message: 'The match is not in the lobby.' };
    }

    const connected = [...room.members.values()].filter(
      (member) => member.connection === ConnectionState.CONNECTED,
    );

    if (connected.length < MIN_PLAYERS_TO_START) {
      return {
        code: ErrorCode.NOT_ENOUGH_PLAYERS,
        message: `${MIN_PLAYERS_TO_START} connected players are needed to start. There are ${connected.length}.`,
      };
    }

    const notReady = connected.filter((member) => !member.isReady);
    if (notReady.length > 0) {
      return {
        code: ErrorCode.PLAYERS_NOT_READY,
        message:
          notReady.length === 1
            ? `${notReady[0]?.username} is not ready.`
            : `${notReady.length} players are not ready.`,
      };
    }

    return null;
  },

  /**
   * Starts the match.
   *
   * Every precondition below is real and enforced. What does not exist yet is
   * the match itself: role assignment is Phase 12 and the game loop is Phase 9
   * onward. Rather than transition the room into a phase nothing can advance -
   * which would strand every player on a "starting" screen - this validates,
   * reports honestly, and leaves the room in the lobby.
   *
   * Phase 12 replaces the throw at the end with the match creation. Nothing
   * above it changes.
   */
  start(userId: string, roomId: string): never {
    const room = requireRoom(roomId);

    const blocker = this.startBlocker(room, userId);
    if (blocker) throw new AppError(blocker.code, blocker.message);

    throw new AppError(
      ErrorCode.SERVICE_UNAVAILABLE,
      'Every check passed, but the match engine is not built yet - roles and the game loop arrive in a later phase.',
      { context: { roomId: room.id, readyToStart: true } },
    );
  },

  /** Marks a player's connection state without disturbing their seat. */
  setConnection(userId: string, roomId: string, connection: ConnectionState): Room | null {
    const room = roomManager.getById(roomId);
    if (!room) return null;
    roomManager.setConnection(room, userId, connection);
    return room;
  },

  /**
   * Called when a disconnected player's grace period expires.
   *
   * Only acts if they are still disconnected: a player who reconnected in the
   * meantime must not be evicted by a timer set before they came back.
   */
  expireGrace(userId: string, roomId: string): Room | null {
    const room = roomManager.getById(roomId);
    if (!room) return null;

    const member = room.members.get(userId);
    if (!member || member.connection === ConnectionState.CONNECTED) return room;

    return this.leave(userId, roomId, 'reconnect grace expired');
  },
};

export type LobbyService = typeof lobbyService;
