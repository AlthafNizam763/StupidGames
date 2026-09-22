import type { Redis as RedisClient } from 'ioredis';
import { ROOM_TEARDOWN_DELAY_MS } from '@voidline/shared';
import { logger } from '../lib/logger';
import { INSTANCE_ID } from './redis';

/**
 * Which instance owns which room.
 *
 * Rooms live in one process's memory (DATABASE.md). With a single instance that
 * is the whole story. With several, a player who joins room `ABC123` has to
 * reach *the instance holding it* - and the load balancer has no idea which one
 * that is.
 *
 * This is the missing third piece DEPLOYMENT.md names. The Redis adapter makes
 * broadcasts cross instances; sticky sessions keep a reconnecting player on the
 * same one; this makes a room *findable* in the first place.
 *
 * Entries expire. A process that dies without cleaning up would otherwise leave
 * its rooms pointing at an instance that is gone, and every join would be
 * routed into a void until someone noticed.
 */

export interface RoomDirectory {
  /** Records that this instance owns a room. */
  claim(code: string, roomId: string): Promise<void>;
  /** Which instance owns this room, if any. */
  lookup(code: string): Promise<{ instanceId: string; roomId: string } | null>;
  /** Releases a room, on close or on shutdown. */
  release(code: string): Promise<void>;
  /** Refreshes the expiry on every room this instance owns. */
  heartbeat(codes: Iterable<string>): Promise<void>;
  /** True when this directory spans more than one process. */
  readonly isDistributed: boolean;
}

/**
 * Single-instance directory.
 *
 * Every room is owned by the only process there is, so `lookup` answers "me"
 * for anything it knows about. It exists so the calling code has one shape to
 * program against whether or not Redis is configured - the alternative is
 * `if (redis)` scattered through the socket layer.
 */
export class InMemoryRoomDirectory implements RoomDirectory {
  readonly isDistributed = false;
  private readonly rooms = new Map<string, string>();

  async claim(code: string, roomId: string): Promise<void> {
    this.rooms.set(code, roomId);
  }

  async lookup(code: string): Promise<{ instanceId: string; roomId: string } | null> {
    const roomId = this.rooms.get(code);
    return roomId ? { instanceId: INSTANCE_ID, roomId } : null;
  }

  async release(code: string): Promise<void> {
    this.rooms.delete(code);
  }

  async heartbeat(): Promise<void> {
    // Nothing expires in a single process.
  }
}

/** Multi-instance directory, backed by Redis keys with a TTL. */
export class RedisRoomDirectory implements RoomDirectory {
  readonly isDistributed = true;

  /**
   * Comfortably longer than the heartbeat interval, so a single missed refresh
   * does not orphan a live room, and short enough that a crashed instance's
   * rooms stop being advertised quickly.
   */
  private readonly ttlSeconds = Math.ceil(ROOM_TEARDOWN_DELAY_MS / 1000);

  constructor(private readonly redis: RedisClient) {}

  private key(code: string): string {
    return `voidline:room:${code.toUpperCase()}`;
  }

  async claim(code: string, roomId: string): Promise<void> {
    try {
      await this.redis.set(
        this.key(code),
        JSON.stringify({ instanceId: INSTANCE_ID, roomId }),
        'EX',
        this.ttlSeconds,
      );
    } catch (error) {
      // A directory failure must not stop a room being created. The room still
      // works on this instance; it is only unfindable from another one.
      logger.error({ code, reason: describe(error) }, 'failed to claim room in directory');
    }
  }

  async lookup(code: string): Promise<{ instanceId: string; roomId: string } | null> {
    try {
      const raw = await this.redis.get(this.key(code));
      if (!raw) return null;

      const parsed = JSON.parse(raw) as { instanceId?: unknown; roomId?: unknown };
      if (typeof parsed.instanceId !== 'string' || typeof parsed.roomId !== 'string') {
        return null;
      }
      return { instanceId: parsed.instanceId, roomId: parsed.roomId };
    } catch (error) {
      logger.error({ code, reason: describe(error) }, 'room directory lookup failed');
      return null;
    }
  }

  async release(code: string): Promise<void> {
    try {
      await this.redis.del(this.key(code));
    } catch (error) {
      // Not fatal: the TTL clears it eventually.
      logger.warn({ code, reason: describe(error) }, 'failed to release room from directory');
    }
  }

  async heartbeat(codes: Iterable<string>): Promise<void> {
    const list = [...codes];
    if (list.length === 0) return;

    try {
      // One round trip for every room, rather than one per room.
      const pipeline = this.redis.pipeline();
      for (const code of list) pipeline.expire(this.key(code), this.ttlSeconds);
      await pipeline.exec();
    } catch (error) {
      logger.warn({ count: list.length, reason: describe(error) }, 'directory heartbeat failed');
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
