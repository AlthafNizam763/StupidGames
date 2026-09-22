import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import {
  ConnectionState,
  ErrorCode,
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
import { authenticateSocket } from './auth';
import { SocketRateLimiter } from './rateLimit';

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

  const namespace = io.of(SOCKET_NAMESPACE);

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

    socket.on('room:join', ({ code }, ack) =>
      handle(ack, async () => {
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

    socket.on('room:ready', ({ ready }, ack) =>
      handle(ack, () => {
        const roomId = socket.data.roomId;
        if (!roomId) throw new AppError(ErrorCode.NOT_IN_ROOM);

        lobbyService.setReady(userId, roomId, ready);
        const room = roomManager.getById(roomId);
        if (room) broadcastRoom(room);
      }),
    );

    socket.on('room:settings', (patch, ack) =>
      handle(ack, async () => {
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

    socket.on('room:kick', ({ userId: targetId }, ack) =>
      handle(ack, () => {
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
        // Runs every precondition and then reports honestly that the match
        // engine is not built. See lobbyService.start.
        lobbyService.start(userId, roomId);
      }),
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
}
