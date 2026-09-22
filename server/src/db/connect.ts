import mongoose from 'mongoose';
import { config } from '../config/env';
import { logger } from '../lib/logger';

/**
 * MongoDB connection lifecycle.
 *
 * The server does not exit when the database is unreachable at boot. It keeps
 * serving, retries in the background, and reports itself as *not ready* until
 * the connection is up - which is what a platform's readiness probe is for. A
 * process that exits on a transient database blip just turns a short outage
 * into a crash loop.
 *
 * Liveness and readiness are therefore different questions, and `/health` and
 * `/health/ready` answer them separately.
 */

/** A one-line summary of a driver error, without its topology dump. */
function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

let retryTimer: NodeJS.Timeout | null = null;
let retryDelayMs = 1_000;
const MAX_RETRY_DELAY_MS = 30_000;

export function isDatabaseReady(): boolean {
  // 1 === connected
  return mongoose.connection.readyState === 1;
}

export function databaseState(): string {
  const states: Record<number, string> = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return states[mongoose.connection.readyState] ?? 'unknown';
}

async function attempt(): Promise<void> {
  await mongoose.connect(config.mongodbUri, {
    // Fail an operation reasonably fast rather than letting a request hang
    // until the client's own timeout fires.
    serverSelectionTimeoutMS: 5_000,
    /*
     * Index builds run automatically in development for convenience. In
     * production they are a deploy step: autoIndex would rebuild indexes on a
     * live collection at the exact moment traffic is shifting (DATABASE.md).
     */
    autoIndex: !config.isProduction,
  });
}

function scheduleRetry(): void {
  if (retryTimer) return;

  retryTimer = setTimeout(() => {
    retryTimer = null;
    void attempt().catch((error: unknown) => {
      logger.warn({ reason: describe(error), nextRetryMs: retryDelayMs }, 'database reconnect failed');
      // Exponential backoff, capped. A database that has been down for ten
      // minutes does not need to be probed every second.
      retryDelayMs = Math.min(retryDelayMs * 2, MAX_RETRY_DELAY_MS);
      scheduleRetry();
    });
  }, retryDelayMs);

  // Do not hold the event loop open purely to retry a connection.
  retryTimer.unref();
}

export async function connectDatabase(): Promise<boolean> {
  mongoose.connection.on('connected', () => {
    retryDelayMs = 1_000;
    logger.info({ db: mongoose.connection.name }, 'database connected');
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('database disconnected');
  });

  /*
   * Message only. A driver connection error carries the full topology state -
   * every server, its wire versions, its heartbeat settings - which runs to a
   * hundred-odd lines per occurrence and buries everything else in the log. The
   * full object is still available at debug level when it is actually wanted.
   */
  mongoose.connection.on('error', (error: unknown) => {
    logger.error({ reason: describe(error) }, 'database error');
    logger.debug({ err: error }, 'database error detail');
  });

  try {
    await attempt();
    return true;
  } catch (error) {
    logger.error(
      {
        reason: describe(error),
        // Strips any user:password from the URI before it reaches a log file.
        uri: config.mongodbUri.replace(/\/\/[^@]*@/, '//<credentials>@'),
      },
      'database unavailable at startup - serving anyway, will keep retrying',
    );
    scheduleRetry();
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  await mongoose.connection.close();
}
