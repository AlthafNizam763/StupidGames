'use client';

import {
  ErrorCode,
  SOCKET_AUTH_TOKEN_KEY,
  SOCKET_NAMESPACE,
  ACK_TIMEOUT_MS,
  type AckResponse,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '@voidline/shared';
import { io, type Socket } from 'socket.io-client';
import { env } from '@/lib/env';
import { authApi } from './auth';

/**
 * The realtime connection.
 *
 * One socket for the whole application, typed against the shared contract in
 * both directions. A single connection rather than one per screen: a socket is
 * the player's identity in a room, and opening a second one would make the
 * server think they are in two places.
 */

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: ClientSocket | null = null;

/** Supplied by the session store so the socket can authenticate and re-auth. */
let getAccessToken: () => string | null = () => null;

export function configureSocketAuth(provider: () => string | null): void {
  getAccessToken = provider;
}

export function getSocket(): ClientSocket {
  if (socket) return socket;

  socket = io(`${env.socketUrl}${SOCKET_NAMESPACE}`, {
    path: '/socket.io',
    // Connect explicitly, once a session exists. Auto-connecting on import
    // would fire a handshake with no token on the sign-in screen.
    autoConnect: false,
    // Skip the long-poll handshake. A game is unplayable on polling anyway,
    // and falling back silently hides a broken deployment (DEPLOYMENT.md).
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
    auth: (cb) => cb({ [SOCKET_AUTH_TOKEN_KEY]: getAccessToken() }),
  });

  /*
   * An expired access token is the one connection failure worth handling
   * automatically: the refresh cookie is still good, so a silent refresh puts
   * the player back rather than bouncing them to the sign-in screen mid-lobby.
   */
  socket.on('connect_error', (error: Error & { data?: { code?: ErrorCode } }) => {
    if (error.data?.code !== ErrorCode.TOKEN_EXPIRED) return;

    void authApi
      .refresh()
      .then(() => socket?.connect())
      .catch(() => {
        // The session is genuinely over. The store's own refresh path has
        // already marked it anonymous; nothing useful to do here.
      });
  });

  return socket;
}

export function connectSocket(): ClientSocket {
  const instance = getSocket();
  if (!instance.connected) instance.connect();
  return instance;
}

export function disconnectSocket(): void {
  socket?.disconnect();
}

/** Drops the connection and forgets it. Used on sign-out. */
export function resetSocket(): void {
  socket?.disconnect();
  socket?.removeAllListeners();
  socket = null;
}

/**
 * Emits an event and waits for its acknowledgement.
 *
 * Turns the two-branch ack into a promise that resolves or rejects, so callers
 * read as ordinary async code. A timeout rejects rather than hanging - a
 * pending promise nobody settles is a button that spins forever.
 */
export function emitWithAck<TData = void>(
  event: keyof ClientToServerEvents,
  ...args: unknown[]
): Promise<TData> {
  return new Promise<TData>((resolve, reject) => {
    const instance = getSocket();

    if (!instance.connected) {
      reject(new SocketError(ErrorCode.SERVICE_UNAVAILABLE, 'Not connected to the station.'));
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new SocketError(ErrorCode.SERVICE_UNAVAILABLE, 'The station did not respond.'));
    }, ACK_TIMEOUT_MS);

    const callback = (response: AckResponse<TData>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (response.ok) resolve(response.data);
      else reject(new SocketError(response.code, response.message));
    };

    // The typed event map guarantees the shape; this call site is generic over
    // every event, which is the one place the types cannot follow.
    (instance.emit as (event: string, ...args: unknown[]) => void)(event, ...args, callback);
  });
}

/** A failed acknowledgement, carrying the server's error code. */
export class SocketError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'SocketError';
    this.code = code;
  }
}
