import {
  ConnectionState,
  ErrorCode,
  GamePhase,
  MIN_PLAYERS_TO_START,
  DEFAULT_APPEARANCE,
  ROOM_CODE_PATTERN,
  validateRoomSettings,
  type CreateRoomInput,
  type RoomState,
  type RoomSummary,
} from '@voidline/shared';
import { AppError } from '../lib/AppError';
import { logger } from '../lib/logger';
import { roomManager, toRoomState, type Room } from '../game/RoomManager';
import { toPublicUser, userRepository } from '../repositories/UserRepository';

/**
 * Room lifecycle rules.
 *
 * A note on what this layer is *for*. Creating and previewing a room happens
 * over REST because it is a one-shot request with a response, and because the
 * join screen has to show a room before committing to it. Actually taking a
 * seat happens over the socket (SOCKET_EVENTS.md): membership is live state,
 * and a REST call cannot tell the room when the player goes away again.
 *
 * So `join` here answers "could I join this?", not "I have joined".
 */

async function requireUser(userId: string) {
  const user = await userRepository.findById(userId);
  if (!user) throw new AppError(ErrorCode.TOKEN_INVALID);
  if (user.disabled) throw new AppError(ErrorCode.ACCOUNT_DISABLED);
  return user;
}

/** Why a room cannot be joined, or null if it can. */
function joinBlocker(room: Room): ErrorCode | null {
  if (room.phase === GamePhase.ENDED) return ErrorCode.ROOM_CLOSED;

  // Anything past the lobby means the match is under way. A late arrival would
  // have no role, no objectives and no position.
  if (room.phase !== GamePhase.LOBBY && room.phase !== GamePhase.WAITING) {
    return ErrorCode.ROOM_IN_PROGRESS;
  }

  if (room.members.size >= room.settings.maxPlayers) return ErrorCode.ROOM_FULL;

  return null;
}

export const roomService = {
  /**
   * Creates a room with the caller as host.
   *
   * Settings are validated with the *same* function the client uses, re-run on
   * the raw input. Sharing the validator gives both sides identical messages;
   * re-running it is what makes the result trustworthy (SECURITY.md).
   */
  async create(userId: string, input: CreateRoomInput): Promise<RoomState> {
    const user = await requireUser(userId);

    const validation = validateRoomSettings(input);
    if (!validation.valid) {
      throw new AppError(ErrorCode.INVALID_SETTINGS, undefined, {
        fieldErrors: validation.errors,
      });
    }

    /*
     * One room per host. A player who creates a second room has almost
     * certainly abandoned the first - a closed tab, a refresh - so the empty
     * one is cleaned up rather than left to the reaper.
     *
     * A room with other people still in it is a different matter: closing that
     * would eject them without warning, so it is refused instead.
     */
    for (const existing of roomManager.findRoomsForUser(userId)) {
      const othersPresent = [...existing.members.values()].some(
        (member) =>
          member.userId !== userId && member.connection !== ConnectionState.DISCONNECTED,
      );

      if (othersPresent) {
        throw new AppError(
          ErrorCode.ALREADY_IN_ROOM,
          `You are already in room ${existing.code}. Leave it before creating another.`,
        );
      }

      roomManager.close(existing, 'superseded by a new room from the same host');
    }

    const room = roomManager.create(
      {
        userId: user.id as string,
        username: user.username,
        avatar: user.avatar,
        appearance: toPublicUser(user).appearance,
        level: user.level,
      },
      validation.settings,
    );

    return toRoomState(room);
  },

  /**
   * The preview shown before joining.
   *
   * Returns `RoomSummary`, which is deliberately thinner than `RoomState`:
   * somebody who has not joined sees the host, the map, the mode and a count,
   * never the roster. A code is a weak secret, and an endpoint that hands over
   * a full player list to anyone who guesses one is a way to find out who is
   * playing with whom.
   */
  async preview(code: string): Promise<RoomSummary> {
    const normalised = code.trim().toUpperCase();

    if (!ROOM_CODE_PATTERN.test(normalised)) {
      throw new AppError(ErrorCode.INVALID_ROOM_CODE);
    }

    const room = roomManager.getByCode(normalised);
    if (!room) throw new AppError(ErrorCode.ROOM_NOT_FOUND);

    const host = await userRepository.findById(room.hostId);

    return {
      code: room.code,
      name: room.settings.name,
      host: host
        ? toPublicUser(host)
        : // The host's account was deleted mid-room. Vanishingly unlikely, but
          // returning a broken object here would crash the join screen.
          {
            id: room.hostId,
            username: 'Unknown',
            avatar: 'operator-01',
            level: 1,
            xp: 0,
            appearance: DEFAULT_APPEARANCE,
          },
      map: room.settings.map,
      gameMode: room.settings.gameMode,
      playerCount: room.members.size,
      maxPlayers: room.settings.maxPlayers,
      phase: room.phase,
      isJoinable: joinBlocker(room) === null,
    };
  },

  /**
   * Checks whether the caller may take a seat, and says why not if they cannot.
   *
   * This does NOT add them to the room. The client opens a socket next, and the
   * room only learns about a player when it has a connection it can also watch
   * for disconnects.
   */
  async checkJoinable(userId: string, code: string): Promise<RoomSummary> {
    await requireUser(userId);

    const summary = await this.preview(code);
    const room = roomManager.getByCode(code.trim().toUpperCase());
    if (!room) throw new AppError(ErrorCode.ROOM_NOT_FOUND);

    // Already holding a seat here: not an error, they are returning to it.
    if (room.members.has(userId)) return summary;

    const blocker = joinBlocker(room);
    if (blocker) throw new AppError(blocker);

    return summary;
  },

  /** The full lobby view. Restricted to players who hold a seat. */
  async getState(userId: string, roomId: string): Promise<RoomState> {
    const room = roomManager.getById(roomId);
    if (!room) throw new AppError(ErrorCode.ROOM_NOT_FOUND);

    if (!room.members.has(userId)) throw new AppError(ErrorCode.NOT_IN_ROOM);

    return toRoomState(room);
  },

  /** Closes a room. Host only. */
  async close(userId: string, roomId: string): Promise<void> {
    const room = roomManager.getById(roomId);
    if (!room) throw new AppError(ErrorCode.ROOM_NOT_FOUND);

    // Re-checked against the room's own record of its host, never against
    // anything the request supplied.
    if (room.hostId !== userId) throw new AppError(ErrorCode.NOT_HOST);

    roomManager.close(room, 'closed by host');
  },

  /**
   * Updates settings. Host only, lobby only.
   *
   * The merged result is re-validated in full rather than just the changed
   * field: dropping `maxPlayers` from 10 to 4 can make an already-valid
   * `saboteurCount` of 3 illegal, and validating the field in isolation would
   * miss it.
   */
  async updateSettings(
    userId: string,
    roomId: string,
    patch: Partial<CreateRoomInput>,
  ): Promise<RoomState> {
    const room = roomManager.getById(roomId);
    if (!room) throw new AppError(ErrorCode.ROOM_NOT_FOUND);
    if (room.hostId !== userId) throw new AppError(ErrorCode.NOT_HOST);
    if (room.phase !== GamePhase.LOBBY) throw new AppError(ErrorCode.WRONG_PHASE);

    const merged = { ...room.settings, ...patch };

    /*
     * The occupancy check runs first, on the merged value, because it is the
     * more actionable error.
     *
     * Shrinking a 10-player room to 4 also breaks the saboteur parity rule, so
     * validating first would answer "at most 1 Saboteur for 4 players" to a
     * host whose actual problem is that six people are already sitting there.
     * Both are true; only one tells them what to do.
     */
    if (merged.maxPlayers !== undefined && merged.maxPlayers < room.members.size) {
      throw new AppError(ErrorCode.INVALID_SETTINGS, undefined, {
        fieldErrors: [
          {
            path: 'maxPlayers',
            message: `There are already ${room.members.size} players in this room.`,
          },
        ],
      });
    }

    const validation = validateRoomSettings(merged);
    if (!validation.valid) {
      throw new AppError(ErrorCode.INVALID_SETTINGS, undefined, {
        fieldErrors: validation.errors,
      });
    }

    room.settings = validation.settings;
    roomManager.touch(room);
    logger.info({ roomId: room.id }, 'room settings updated');

    return toRoomState(room);
  },

  /** Whether a room currently has enough players to begin. Used by Phase 7. */
  canStart(room: Room): boolean {
    return room.members.size >= MIN_PLAYERS_TO_START;
  },
};

export type RoomService = typeof roomService;
