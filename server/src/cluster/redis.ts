import { randomUUID } from 'node:crypto';
import Redis, { type Redis as RedisClient } from 'ioredis';
import { config } from '../config/env';
import { logger } from '../lib/logger';

/**
 * Redis connections, and this instance's identity.
 *
 * Everything here is optional. With no `REDIS_URL` the server runs exactly as
 * it did before - one instance, rooms in its own memory, the default in-memory
 * Socket.IO adapter. That is the correct setup for development and for a
 * single-region launch, and it must not require a Redis to be running.
 *
 * With `REDIS_URL` set, three separate connections are opened. The Socket.IO
 * adapter needs a dedicated publisher and subscriber because a client in
 * subscriber mode cannot issue ordinary commands, and the room directory needs
 * a third that *can*.
 */

/**
 * A stable id for this process.
 *
 * Used by the room directory to record which instance owns a room. Regenerated
 * on restart, which is correct: a restarted process owns no rooms, since they
 * live in memory (DATABASE.md).
 */
export const INSTANCE_ID = randomUUID();

export interface RedisConnections {
  pub: RedisClient;
  sub: RedisClient;
  commands: RedisClient;
}

let connections: RedisConnections | null = null;

function createClient(url: string, role: string): RedisClient {
  const client = new Redis(url, {
    /*
     * Fail fast and keep retrying with backoff rather than queueing commands
     * forever. A queued command that resolves five minutes later is worse than
     * one that fails now - by then the room it referred to may not exist.
     */
    maxRetriesPerRequest: 3,
    enableOfflineQueue: false,
    retryStrategy: (times) => Math.min(times * 200, 5_000),
    lazyConnect: false,
  });

  client.on('error', (error: Error) => {
    // Message only. A connection error repeats on every retry, and the full
    // object would bury the log the way the Mongo driver's used to.
    logger.error({ role, reason: error.message }, 'redis connection error');
  });

  client.on('ready', () => logger.info({ role }, 'redis connected'));

  return client;
}

/** Opens the connections, or returns null when Redis is not configured. */
export function initRedis(): RedisConnections | null {
  if (!config.redisUrl) {
    logger.info(
      { instanceId: INSTANCE_ID },
      'REDIS_URL not set - running single-instance with in-memory rooms',
    );
    return null;
  }

  if (connections) return connections;

  const pub = createClient(config.redisUrl, 'pub');
  connections = {
    pub,
    // The subscriber must be its own connection: a client in subscriber mode
    // cannot run normal commands.
    sub: pub.duplicate(),
    commands: pub.duplicate(),
  };

  logger.info({ instanceId: INSTANCE_ID }, 'redis enabled - multi-instance mode');
  return connections;
}

export function getRedis(): RedisConnections | null {
  return connections;
}

export async function closeRedis(): Promise<void> {
  if (!connections) return;

  const { pub, sub, commands } = connections;
  connections = null;

  await Promise.allSettled([pub.quit(), sub.quit(), commands.quit()]);
  logger.info('redis connections closed');
}
