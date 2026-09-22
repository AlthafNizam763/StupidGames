import type { Server } from 'node:http';
import { createApp } from './app';
import { clearGraceTimers, createSocketServer, type GameServer } from './sockets';
import { config } from './config/env';
import { connectDatabase, disconnectDatabase } from './db/connect';
import { logger } from './lib/logger';

/**
 * Process bootstrap.
 *
 * Starts the HTTP server, connects the database, and shuts both down cleanly on
 * a platform signal. Graceful shutdown matters more here than in a typical API:
 * live matches are held in memory (DATABASE.md), so killing the process
 * abruptly loses them. Draining gives in-flight requests time to finish, and
 * from Phase 8 it is also where connected players are told the instance is
 * going away.
 */

const SHUTDOWN_TIMEOUT_MS = 10_000;

let httpServer: Server | null = null;
let socketServer: GameServer | null = null;
let shuttingDown = false;

async function shutdown(reason: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ reason }, 'shutting down');

  /*
   * A connection that refuses to close must not hold the process open forever -
   * the platform would eventually SIGKILL it, which is the abrupt exit this
   * whole routine exists to avoid.
   */
  const forceExit = setTimeout(() => {
    logger.error('shutdown timed out, exiting immediately');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  try {
    /*
     * Sockets close first. Shutting the HTTP server while connections are open
     * leaves clients reconnecting into a process that is on its way out; this
     * way they are disconnected once and reconnect to a healthy instance.
     *
     * Pending seat releases are cancelled too - firing one against a room that
     * no longer exists is harmless but noisy, and they would otherwise be the
     * last thing holding a timer.
     */
    if (socketServer) {
      clearGraceTimers();
      await socketServer.close();
      logger.info('socket server closed');
    }

    if (httpServer) {
      await new Promise<void>((resolve, reject) => {
        httpServer?.close((error) => (error ? reject(error) : resolve()));
      });
      logger.info('http server closed');
    }
    await disconnectDatabase();
    logger.info('database connection closed');
  } catch (error) {
    logger.error({ err: error }, 'error during shutdown');
    exitCode = 1;
  }

  clearTimeout(forceExit);
  process.exit(exitCode);
}

async function start(): Promise<void> {
  const app = createApp();

  // Deliberately not awaited as a precondition: the server serves regardless,
  // and reports readiness separately. See db/connect.ts.
  const databaseReady = await connectDatabase();

  httpServer = app.listen(config.port, () => {
    // Attached after the port is open so a client cannot race the handshake
    // against a half-initialised namespace.
    socketServer = createSocketServer(httpServer as Server);

    logger.info(
      {
        port: config.port,
        env: config.nodeEnv,
        cors: config.corsOrigins,
        database: databaseReady ? 'connected' : 'unavailable (retrying)',
      },
      `VOIDLINE server listening on http://localhost:${config.port}`,
    );
  });

  httpServer.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.fatal(
        { port: config.port },
        'port already in use - another instance may be running',
      );
      process.exit(1);
    }
    logger.fatal({ err: error }, 'http server error');
    process.exit(1);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

/*
 * An unhandled rejection or an uncaught exception means the process is in an
 * unknown state. It is logged in full and then shut down: continuing to serve
 * players from a process whose invariants may already be broken is worse than
 * a restart.
 */
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'unhandled promise rejection');
  void shutdown('unhandledRejection', 1);
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'uncaught exception');
  void shutdown('uncaughtException', 1);
});

void start().catch((error: unknown) => {
  logger.fatal({ err: error }, 'failed to start');
  process.exit(1);
});
