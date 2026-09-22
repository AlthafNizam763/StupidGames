import type { Server as HttpServer } from 'node:http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { io, type Socket } from 'socket.io-client';

/**
 * In-process end-to-end harness.
 *
 * Starts a real MongoDB, a real Express app and a real Socket.IO server inside
 * the test process, then hands back HTTP and socket clients pointed at them.
 *
 * These tests exist because the unit tests could not have caught several of the
 * bugs that shipped. Three examples from this project, all green under every
 * other check:
 *
 *   - the voting result was stored *after* the event that broadcasts it, so
 *     every client received an empty tally
 *   - the CSP went out without `connect-src`, which would have blocked the
 *     client from reaching its own server
 *   - movement bypassed the rate limiter, because it deliberately bypasses the
 *     handler wrapper the limiter lives in
 *
 * Each is a seam between components. Unit tests check components.
 *
 * In-process rather than spawning the built server: no build step, failures
 * surface as ordinary stack traces, and a hung test can be debugged rather than
 * guessed at from a child process's stdout.
 */

export interface E2EServer {
  baseUrl: string;
  /** Authenticated REST call. Returns the parsed envelope. */
  rest: <T = unknown>(
    path: string,
    options?: { method?: string; body?: unknown; token?: string },
  ) => Promise<{ status: number; json: ApiEnvelope<T> | null; headers: Headers }>;
  /** Registers an account and returns its token. */
  register: (name: string) => Promise<TestPlayer>;
  /** Opens an authenticated socket that records everything it receives. */
  connect: (token: string) => Promise<TestSocket>;
  stop: () => Promise<void>;
}

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  code: string | null;
  data: T;
  errors?: Array<{ path: string; message: string }>;
}

export interface TestPlayer {
  token: string;
  user: { id: string; username: string; email: string };
}

/** A socket that keeps every event it saw, so a test can assert on history. */
export interface TestSocket extends Socket {
  received: Map<string, unknown[]>;
  /** Latest payload for an event, or undefined. */
  latest: <T = unknown>(event: string) => T | undefined;
  /** Every payload for an event. */
  all: <T = unknown>(event: string) => T[];
  /** Emits and resolves with the acknowledgement. */
  call: <T = unknown>(event: string, payload?: unknown) => Promise<AckResult<T>>;
  /** Waits until a predicate holds, or times out. */
  until: (predicate: () => boolean, timeoutMs?: number) => Promise<boolean>;
}

export type AckResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

/** Events the harness records. Anything not listed is still delivered, just not kept. */
const RECORDED_EVENTS = [
  'room:state',
  'room:closed',
  'room:kicked',
  'game:start',
  'game:state',
  'game:delta',
  'game:self',
  'game:timer',
  'game:result',
  'player:eliminated',
  'player:disconnect',
  'player:reconnect',
  'task:updated',
  'task:team',
  'sabotage:started',
  'sabotage:updated',
  'sabotage:resolved',
  'body:reported',
  'council:start',
  'council:chat',
  'council:voting_open',
  'council:vote',
  'council:result',
  'system:error',
];

let portCursor = 4500;

export async function startE2EServer(): Promise<E2EServer> {
  const mongo = await MongoMemoryServer.create();
  const port = portCursor++;

  /*
   * Environment before imports.
   *
   * `config` is evaluated at module load, so every module that reads it has to
   * be imported *after* this - which is why the app is pulled in dynamically
   * rather than at the top of the file.
   */
  process.env.NODE_ENV = 'test';
  process.env.PORT = String(port);
  process.env.MONGODB_URI = mongo.getUri('voidline');
  process.env.CORS_ORIGINS = 'http://localhost:3000';
  process.env.JWT_SECRET ??= 'e2e-test-secret-'.padEnd(48, 'x');
  process.env.JWT_REFRESH_SECRET ??= 'e2e-refresh-secret-'.padEnd(48, 'y');
  // No LOG_LEVEL override: `config.isTest` already silences the logger, and
  // "silent" is not one of pino's levels, so setting it fails env validation.
  process.env.LOG_LEVEL = 'fatal';

  const { createApp } = await import('../../app');
  const { createSocketServer } = await import('../../sockets');
  const { connectDatabase, disconnectDatabase } = await import('../../db/connect');

  await connectDatabase();

  const app = createApp();
  const httpServer: HttpServer = await new Promise((resolve) => {
    const server = app.listen(port, () => resolve(server));
  });
  const socketServer = createSocketServer(httpServer);

  const baseUrl = `http://localhost:${port}`;
  const sockets: TestSocket[] = [];

  async function rest<T>(
    path: string,
    { method = 'GET', body, token }: { method?: string; body?: unknown; token?: string } = {},
  ) {
    const headers: Record<string, string> = { Origin: 'http://localhost:3000' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    return {
      status: response.status,
      json: (await response.json().catch(() => null)) as ApiEnvelope<T> | null,
      headers: response.headers,
    };
  }

  let accountSeq = 0;

  async function register(name: string): Promise<TestPlayer> {
    accountSeq += 1;
    const result = await rest<{ accessToken: string; user: TestPlayer['user'] }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: {
          username: `${name}_${accountSeq}`.slice(0, 16),
          email: `${name.toLowerCase()}${accountSeq}@voidline.test`,
          password: 'correct horse battery',
        },
      },
    );

    if (!result.json?.success) {
      throw new Error(`register failed: ${JSON.stringify(result.json)}`);
    }

    return { token: result.json.data.accessToken, user: result.json.data.user };
  }

  function connect(token: string): Promise<TestSocket> {
    return new Promise((resolve, reject) => {
      const socket = io(`${baseUrl}/game`, {
        transports: ['websocket'],
        auth: { token },
        reconnection: false,
      }) as TestSocket;

      socket.received = new Map();

      for (const event of RECORDED_EVENTS) {
        socket.on(event, (payload: unknown) => {
          const list = socket.received.get(event) ?? [];
          list.push(payload);
          socket.received.set(event, list);
        });
      }

      socket.latest = <T>(event: string) => {
        const list = socket.received.get(event);
        return list?.[list.length - 1] as T | undefined;
      };

      socket.all = <T>(event: string) => (socket.received.get(event) ?? []) as T[];

      socket.call = <T>(event: string, payload?: unknown) =>
        new Promise<AckResult<T>>((settle) => {
          const args = payload === undefined ? [] : [payload];
          socket.emit(event, ...args, (result: AckResult<T>) => settle(result));
          // A handler that never acknowledges would otherwise hang the suite
          // with no indication of which call did it.
          setTimeout(
            () => settle({ ok: false, code: 'ACK_TIMEOUT', message: `no ack for ${event}` }),
            8000,
          );
        });

      socket.until = async (predicate, timeoutMs = 30_000) => {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          if (predicate()) return true;
          await delay(100);
        }
        return false;
      };

      socket.on('connect', () => {
        sockets.push(socket);
        resolve(socket);
      });
      socket.on('connect_error', reject);
      setTimeout(() => reject(new Error('socket connect timed out')), 8000);
    });
  }

  async function stop() {
    for (const socket of sockets) socket.disconnect();

    const { clearGraceTimers, getMatchManager } = await import('../../sockets');
    clearGraceTimers();
    getMatchManager()?.stopAll();

    const { roomManager } = await import('../../game/RoomManager');
    roomManager.stop();
    roomManager.clear();

    await socketServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await disconnectDatabase();
    await mongo.stop();
  }

  return { baseUrl, rest, register, connect, stop };
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Waits for a match phase, so a test never races the five-second role reveal. */
export async function waitForPhase(
  socket: TestSocket,
  phase: string,
  timeoutMs = 40_000,
): Promise<boolean> {
  return socket.until(
    () => (socket.latest<{ phase?: string }>('game:state')?.phase ?? '') === phase,
    timeoutMs,
  );
}
