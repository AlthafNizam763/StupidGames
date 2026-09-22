import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  ConnectionState,
  ErrorCode,
  CHAT_RATE_LIMIT,
  GamePhase,
  RECONNECT_GRACE_MS,
  SERVER_EVENT,
  SOCKET_NAMESPACE,
  type AckResponse,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@voidline/shared';
import { config } from '../config/env';
import { AppError, isAppError } from '../lib/AppError';
import { logger } from '../lib/logger';
import { roomManager, toRoomState, type Room } from '../game/RoomManager';
import { lobbyService } from '../services/lobbyService';
import { roomService } from '../services/roomService';
import { createAdapter } from '@socket.io/redis-adapter';
import {
  InMemoryRoomDirectory,
  RedisRoomDirectory,
  type RoomDirectory,
} from '../cluster/RoomDirectory';
import { INSTANCE_ID, getRedis } from '../cluster/redis';
import { authenticateSocket } from './auth';
import {
  chatPayload,
  eliminatePayload,
  joinRoomPayload,
  kickPayload,
  parsePayload,
  puzzleSolutionPayload,
  readyPayload,
  repairPayload,
  reportPayload,
  sabotagePayload,
  settingsPayload,
  taskStartPayload,
  votePayload,
} from './payloads';
import { SocketRateLimiter } from './rateLimit';
import { createMatchManager } from './matchWiring';
import { getMap } from '../game/maps';
import {
  handleChat,
  handleEliminate,
  handleEmergency,
  handleMove,
  handleRepair,
  handleReport,
  handleResume,
  handleSabotage,
  handleTaskStart,
  handleTaskStep,
  handleVote,
  type GameContext,
} from './gameHandlers';
import type { MatchManager } from '../game/match/MatchManager';
import { toSelfState, toSnapshot } from '../game/match/serialise';

/**
 * The realtime layer.
 *
 * Typed end to end against the shared contract, so an event name or payload
 * this server does not implement is a compile error in the client rather than a
 * message that silently goes nowhere.
 *
 * Three things this file is responsible for and nothing else is:
 *
 * 1. Authenticating the handshake, so no unverified socket reaches a handler.
 * 2. Turning every handler into one that cannot crash the connection - a thrown
 *    AppError becomes a failed acknowledgement, an unexpected throw becomes a
 *    logged INTERNAL_ERROR.
 * 3. Holding a disconnected player's seat for the grace period, and releasing
 *    it when they do not come back.
 */

export type GameSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type GameServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

/** Socket.IO room name for a VOIDLINE room. */
function channel(roomId: string): string {
  return `room:${roomId}`;
}

/**
 * Pending seat releases, keyed by `userId:roomId`.
 *
 * A player who drops keeps their seat for RECONNECT_GRACE_MS. The timer is
 * cancelled if they return, which is what makes a dropped connection a pause
 * rather than an ejection.
 */
const graceTimers = new Map<string, NodeJS.Timeout>();

/**
 * The room directory: which instance owns which room.
 *
 * In-memory with one instance, Redis-backed with several. Exposed so the room
 * service can claim and release entries without knowing which it got.
 */
let directory: RoomDirectory = new InMemoryRoomDirectory();

export function getRoomDirectory(): RoomDirectory {
  return directory;
}

/** Refreshes directory entries so a live room's claim does not expire. */
let heartbeatTimer: NodeJS.Timeout | null = null;

/** The match engine for this instance. Created with the socket server. */
let matches: MatchManager | null = null;

export function getMatchManager(): MatchManager | null {
  return matches;
}

const HEARTBEAT_INTERVAL_MS = 30_000;

function graceKey(userId: string, roomId: string): string {
  return `${userId}:${roomId}`;
}

function cancelGrace(userId: string, roomId: string): void {
  const key = graceKey(userId, roomId);
  const timer = graceTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    graceTimers.delete(key);
  }
}

export function createSocketServer(httpServer: HttpServer): GameServer {
  const io: GameServer = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: config.corsOrigins,
      credentials: true,
    },
    /*
     * Longer than the default so a phone that backgrounds the tab for a moment
     * is not disconnected outright. The reconnect grace period is the real
     * safety net; this just avoids using it unnecessarily.
     */
    pingTimeout: 25_000,
    pingInterval: 20_000,
  });

  /*
   * The Redis adapter, when Redis is configured.
   *
   * Without it, `namespace.to(room).emit(...)` only reaches sockets held by
   * *this* process - so with two instances, half the lobby never sees the
   * broadcast. The adapter republishes every emit over Redis pub/sub so the
   * other instances deliver it to their own sockets.
   *
   * This is one of the three things DEPLOYMENT.md says scale-out needs. The
   * other two are sticky sessions (platform configuration) and the room
   * directory below.
   */
  const redis = getRedis();
  if (redis) {
    io.adapter(createAdapter(redis.pub, redis.sub, { key: 'voidline' }));
    directory = new RedisRoomDirectory(redis.commands);

    heartbeatTimer = setInterval(() => {
      void directory.heartbeat(roomManager.activeCodes());
    }, HEARTBEAT_INTERVAL_MS);
    heartbeatTimer.unref();

    logger.info({ instanceId: INSTANCE_ID }, 'socket.io using the redis adapter');
  }

  const namespace = io.of(SOCKET_NAMESPACE);

  matches = createMatchManager(namespace);

  /**
   * Fan-out helpers handed to the gameplay handlers.
   *
   * `toPlayer` walks this instance's sockets rather than using a Socket.IO
   * room per user. With the Redis adapter a player's other sockets could be on
   * another instance - but a player's gameplay sockets are always here,
   * because a room lives on one instance and sticky sessions keep them on it.
   */
  /*
   * The two emits below are the only untyped ones in the codebase.
   *
   * `GameContext` is deliberately generic over event name and payload so the
   * handlers can be tested with a fake context and have no dependency on
   * Socket.IO. The cost is that this one boundary cannot be checked by the
   * event map - so it is confined to these four lines, and every caller passes
   * a `SERVER_EVENT` constant rather than a string literal.
   */
  type LooseEmitter = { emit: (event: string, payload: unknown) => void };

  const gameContext: GameContext = {
    matches,
    toRoom: (roomId, event, payload) => {
      (namespace.to(channel(roomId)) as unknown as LooseEmitter).emit(event, payload);
    },
    toPlayer: (userId, event, payload) => {
      for (const [, socket] of namespace.sockets) {
        if (socket.data.userId === userId) {
          (socket as unknown as LooseEmitter).emit(event, payload);
        }
      }
    },
  };

  /* ------------------------------------------------------ handshake - */

  namespace.use((socket, next) => {
    void authenticateSocket(socket)
      .then(() => next())
      .catch((error: unknown) => {
        const appError = isAppError(error)
          ? error
          : new AppError(ErrorCode.UNAUTHENTICATED, undefined, { cause: error });

        logger.warn({ code: appError.code, socketId: socket.id }, 'socket handshake refused');

        // The message reaches the client's `connect_error` handler, which
        // branches on the code: TOKEN_EXPIRED means refresh and retry.
        const wrapped = new Error(appError.message);
        (wrapped as Error & { data?: unknown }).data = { code: appError.code };
        next(wrapped);
      });
  });

  /* ------------------------------------------------- connection - */

  namespace.on('connection', (socket: GameSocket) => {
    const limiter = new SocketRateLimiter();
    const { userId } = socket.data;

    logger.debug({ socketId: socket.id, userId }, 'socket connected');

    /**
     * Wraps a handler so a failure becomes an acknowledgement rather than a
     * crash, and so every event passes the rate limiter first.
     *
     * Handlers therefore read as their rules and nothing else - no try/catch,
     * no limiter bookkeeping, no manual error shaping.
     */
    function handle<T>(
      ack: ((response: AckResponse<T>) => void) | undefined,
      run: () => Promise<T> | T,
    ): void {
      if (!limiter.allowEvent()) {
        ack?.({
          ok: false,
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many requests. Slow down.',
        });
        return;
      }

      void (async () => {
        try {
          ack?.({ ok: true, data: await run() });
        } catch (error) {
          const appError = isAppError(error)
            ? error
            : new AppError(ErrorCode.INTERNAL_ERROR, undefined, { cause: error });

          if (appError.isServerFault) {
            logger.error(
              { err: appError.cause ?? appError, userId, socketId: socket.id },
              'socket handler failed',
            );
          }

          ack?.({ ok: false, code: appError.code, message: appError.message });
        }
      })();
    }

    /** Broadcasts the current lobby to everyone in the room. */
    function broadcastRoom(room: Room): void {
      namespace.to(channel(room.id)).emit(SERVER_EVENT.ROOM_STATE, toRoomState(room));
    }

    /* ------------------------------------------------------ room - */

    socket.on('room:join', (payload, ack) =>
      handle(ack, async () => {
        // Validated before anything downstream sees it. A socket payload does
        // not pass through the body parser or the operator guard, so this is
        // the only thing standing between a handler and whatever was sent.
        const { code } = parsePayload(joinRoomPayload, payload);
        const { room, resumed } = await lobbyService.join(userId, code);

        // A seat is held across a drop, so a returning player must have their
        // pending release cancelled before anything else.
        cancelGrace(userId, room.id);

        await socket.join(channel(room.id));
        socket.data.roomId = room.id;
        socket.data.roomCode = room.code;

        if (resumed) {
          socket.to(channel(room.id)).emit(SERVER_EVENT.PLAYER_RECONNECT, { playerId: userId });
        }

        broadcastRoom(room);
        logger.info({ roomId: room.id, userId, resumed }, 'player joined room');

        return toRoomState(room);
      }),
    );

    socket.on('room:leave', (ack) =>
      handle(ack, () => {
        const roomId = socket.data.roomId;
        if (!roomId) throw new AppError(ErrorCode.NOT_IN_ROOM);

        cancelGrace(userId, roomId);
        const room = lobbyService.leave(userId, roomId, 'left deliberately');

        void socket.leave(channel(roomId));
        socket.data.roomId = null;
        socket.data.roomCode = null;

        if (room) broadcastRoom(room);
      }),
    );

    socket.on('room:ready', (payload, ack) =>
      handle(ack, () => {
        const { ready } = parsePayload(readyPayload, payload);
        const roomId = socket.data.roomId;
        if (!roomId) throw new AppError(ErrorCode.NOT_IN_ROOM);

        lobbyService.setReady(userId, roomId, ready);
        const room = roomManager.getById(roomId);
        if (room) broadcastRoom(room);
      }),
    );

    socket.on('room:settings', (rawPatch, ack) =>
      handle(ack, async () => {
        const patch = parsePayload(settingsPayload, rawPatch);
        const roomId = socket.data.roomId;
        if (!roomId) throw new AppError(ErrorCode.NOT_IN_ROOM);

        // Reuses the REST service, so the host gets identical validation
        // whichever transport they came in on.
        const state = await roomService.updateSettings(userId, roomId, patch);

        const room = roomManager.getById(roomId);
        if (room) broadcastRoom(room);

        return state;
      }),
    );

    socket.on('room:kick', (payload, ack) =>
      handle(ack, () => {
        const { userId: targetId } = parsePayload(kickPayload, payload);
        const roomId = socket.data.roomId;
        if (!roomId) throw new AppError(ErrorCode.NOT_IN_ROOM);

        const { room } = lobbyService.kick(userId, roomId, targetId);

        // Told directly, before being removed from the channel, so they learn
        // why they are back on the home screen.
        for (const [, other] of namespace.sockets) {
          if (other.data.userId === targetId && other.data.roomId === roomId) {
            other.emit(SERVER_EVENT.ROOM_KICKED, { by: userId });
            void other.leave(channel(roomId));
            other.data.roomId = null;
            other.data.roomCode = null;
          }
        }

        cancelGrace(targetId, roomId);
        broadcastRoom(room);
      }),
    );

    socket.on('room:close', (ack) =>
      handle(ack, () => {
        const roomId = socket.data.roomId;
        if (!roomId) throw new AppError(ErrorCode.NOT_IN_ROOM);

        const room = lobbyService.closeRoom(userId, roomId);

        namespace
          .to(channel(room.id))
          .emit(SERVER_EVENT.ROOM_CLOSED, { reason: 'The host closed this room.' });

        // Everyone leaves the channel, or a recreated room with the same id
        // would inherit ghost subscribers.
        for (const [, other] of namespace.sockets) {
          if (other.data.roomId === roomId) {
            void other.leave(channel(roomId));
            other.data.roomId = null;
            other.data.roomCode = null;
          }
        }
      }),
    );

    socket.on('room:start', (ack) =>
      handle(ack, () => {
        const roomId = socket.data.roomId;
        if (!roomId) throw new AppError(ErrorCode.NOT_IN_ROOM);

        const room = roomManager.getById(roomId);
        if (!room) throw new AppError(ErrorCode.ROOM_NOT_FOUND);

        // Host, phase, connected count and readiness - all re-checked here,
        // never trusted from whatever the lobby screen decided to render.
        const blocker = lobbyService.startBlocker(room, userId);
        if (blocker) throw new AppError(blocker.code, blocker.message);

        if (!matches) throw new AppError(ErrorCode.SERVICE_UNAVAILABLE);

        roomManager.setPhase(room, GamePhase.STARTING);
        const match = matches.start(room, getMap(room.settings.map));
        room.matchId = match.id;

        /*
         * Each player is told the world and their own private slice in one
         * message. Sent per socket rather than broadcast, because `self`         * differs for every recipient - it is the only payload in the game
         * that carries a role.
         */
        for (const [, other] of namespace.sockets) {
          const player = match.players.get(other.data.userId);
          if (player && other.data.roomId === roomId) {
            other.emit(SERVER_EVENT.GAME_START, {
              snapshot: toSnapshot(match),
              self: toSelfState(match, player),
            });
          }
        }

        broadcastRoom(room);
      }),
    );

    /* ------------------------------------------------- gameplay - */

    socket.on('player:move', (input) => {
      // No ack and no rate-limit wrapper: this fires 15 times a second and the
      // sequence guard inside applyInput is the real protection.
      handleMove(gameContext, userId, socket.data.roomId, input);
    });

    socket.on('player:eliminate', (payload, ack) =>
      handle(ack, () => {
        const { targetId } = parsePayload(eliminatePayload, payload);
        handleEliminate(gameContext, userId, socket.data.roomId, targetId);
      }),
    );

    socket.on('task:start', (payload, ack) =>
      handle(ack, () => {
        const { taskId } = parsePayload(taskStartPayload, payload);
        return handleTaskStart(gameContext, userId, socket.data.roomId, taskId);
      }),
    );

    socket.on('task:progress', (payload, ack) =>
      handle(ack, () => {
        const solution = parsePayload(puzzleSolutionPayload, payload);
        const result = handleTaskStep(gameContext, userId, socket.data.roomId, {
          taskId: solution.taskId,
          step: solution.step,
          values: solution.values,
        });
        return result.next;
      }),
    );

    socket.on('task:complete', (payload, ack) =>
      handle(ack, () => {
        const solution = parsePayload(puzzleSolutionPayload, payload);
        const result = handleTaskStep(gameContext, userId, socket.data.roomId, {
          taskId: solution.taskId,
          step: solution.step,
          values: solution.values,
        });
        if (!result.completed) {
          throw new AppError(ErrorCode.TASK_VERIFICATION_FAILED, 'That objective has more steps.');
        }
        return result.completed;
      }),
    );

    socket.on('sabotage:start', (payload, ack) =>
      handle(ack, () => {
        const { type } = parsePayload(sabotagePayload, payload);
        return handleSabotage(gameContext, userId, socket.data.roomId, type);
      }),
    );

    socket.on('sabotage:repair', (payload, ack) =>
      handle(ack, () => {
        const { stationId } = parsePayload(repairPayload, payload);
        return handleRepair(gameContext, userId, socket.data.roomId, stationId);
      }),
    );

    socket.on('body:report', (payload, ack) =>
      handle(ack, () => {
        const { bodyId } = parsePayload(reportPayload, payload);
        handleReport(gameContext, userId, socket.data.roomId, bodyId);
      }),
    );

    socket.on('council:emergency', (ack) =>
      handle(ack, () => {
        handleEmergency(gameContext, userId, socket.data.roomId);
      }),
    );

    socket.on('council:chat', (payload, ack) =>
      handle(ack, () => {
        const input = parsePayload(chatPayload, payload);
        // Chat has its own per-channel budget on top of the global one, so a
        // flood on one channel cannot silence another.
        if (!limiter.allowChat(input.channel, CHAT_RATE_LIMIT.messages, CHAT_RATE_LIMIT.windowMs)) {
          throw new AppError(ErrorCode.RATE_LIMITED, 'You are sending messages too quickly.');
        }
        return handleChat(gameContext, userId, socket.data.roomId, input.body);
      }),
    );

    socket.on('council:vote', (payload, ack) =>
      handle(ack, () => {
        const input = parsePayload(votePayload, payload);
        handleVote(gameContext, userId, socket.data.roomId, input.meetingId, input.target);
      }),
    );

    socket.on('game:resume', (ack) =>
      handle(ack, () => handleResume(gameContext, userId, socket.data.roomId)),
    );

    /* ------------------------------------------------ disconnect - */

    socket.on('disconnect', (reason) => {
      limiter.dispose();
      logger.debug({ socketId: socket.id, userId, reason }, 'socket disconnected');

      const roomId = socket.data.roomId;
      if (!roomId) return;

      /*
       * Another tab may still be connected for this player. Releasing the seat
       * because one of them closed would eject somebody who is still playing.
       */
      const stillConnected = [...namespace.sockets.values()].some(
        (other) =>
          other.id !== socket.id && other.data.userId === userId && other.data.roomId === roomId,
      );
      if (stillConnected) return;

      const room = lobbyService.setConnection(userId, roomId, ConnectionState.RECONNECTING);
      if (!room) return;

      namespace.to(channel(roomId)).emit(SERVER_EVENT.PLAYER_DISCONNECT, { playerId: userId });
      broadcastRoom(room);

      cancelGrace(userId, roomId);
      const timer = setTimeout(() => {
        graceTimers.delete(graceKey(userId, roomId));
        const after = lobbyService.expireGrace(userId, roomId);
        if (after) broadcastRoom(after);
      }, RECONNECT_GRACE_MS);

      // A pending seat release must not keep the process alive at shutdown.
      timer.unref();
      graceTimers.set(graceKey(userId, roomId), timer);
    });
  });

  logger.info({ namespace: SOCKET_NAMESPACE }, 'socket server ready');
  return io;
}

/** Cancels every pending grace timer. Used by graceful shutdown and tests. */
export function clearGraceTimers(): void {
  for (const timer of graceTimers.values()) clearTimeout(timer);
  graceTimers.clear();

  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

/**
 * Tells connected players the instance is going away, then gives the message a
 * moment to leave.
 *
 * Without this, a deploy simply drops every socket. The client reconnects and
 * finds its room gone - rooms are in memory (DATABASE.md) - with nothing to
 * explain why. A closed-room notice turns a mystery into a message.
 *
 * The wait is short and deliberate: shutdown has its own hard timeout, and this
 * must not be what uses it up.
 */
export async function notifyShutdown(io: GameServer): Promise<void> {
  const namespace = io.of(SOCKET_NAMESPACE);
  const socketCount = namespace.sockets.size;
  if (socketCount === 0) return;

  logger.info({ sockets: socketCount }, 'notifying connected players of shutdown');

  namespace.emit(SERVER_EVENT.ROOM_CLOSED, {
    reason: 'The server is restarting. Your room has ended.',
  });

  await new Promise((resolve) => setTimeout(resolve, 250));
}
