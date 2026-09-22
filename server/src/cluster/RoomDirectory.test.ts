import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import RedisMock from 'ioredis-mock';
import type { Redis as RedisClient } from 'ioredis';
import { InMemoryRoomDirectory, RedisRoomDirectory } from './RoomDirectory';
import { INSTANCE_ID } from './redis';

/**
 * The room directory, against both backends.
 *
 * The Redis implementation is exercised with `ioredis-mock`, which is a real
 * in-process implementation of the command set rather than a stub with
 * hand-written return values - so `set`/`get`/`del`/`expire` and the pipeline
 * behave as Redis does.
 *
 * What this does NOT prove is behaviour against a real Redis server over a
 * network: TTL expiry in wall-clock time, connection loss, or cross-process
 * visibility. Those need a server, which this environment does not have.
 */

const clients: RedisClient[] = [];

function makeRedis(): RedisClient {
  const client = new RedisMock() as unknown as RedisClient;
  clients.push(client);
  return client;
}

afterEach(async () => {
  await Promise.allSettled(clients.splice(0).map((client) => client.quit()));
});

describe('InMemoryRoomDirectory', () => {
  it('reports a claimed room as owned by this instance', async () => {
    const directory = new InMemoryRoomDirectory();
    await directory.claim('ABC123', 'room-1');

    const found = await directory.lookup('ABC123');
    assert.deepEqual(found, { instanceId: INSTANCE_ID, roomId: 'room-1' });
  });

  it('returns null for an unknown code', async () => {
    const directory = new InMemoryRoomDirectory();
    assert.equal(await directory.lookup('ZZZZZZ'), null);
  });

  it('forgets a released room', async () => {
    const directory = new InMemoryRoomDirectory();
    await directory.claim('ABC123', 'room-1');
    await directory.release('ABC123');
    assert.equal(await directory.lookup('ABC123'), null);
  });

  it('is not distributed', () => {
    assert.equal(new InMemoryRoomDirectory().isDistributed, false);
  });
});

describe('RedisRoomDirectory', () => {
  it('records the owning instance and room id', async () => {
    const directory = new RedisRoomDirectory(makeRedis());
    await directory.claim('ABC123', 'room-1');

    const found = await directory.lookup('ABC123');
    assert.deepEqual(found, { instanceId: INSTANCE_ID, roomId: 'room-1' });
  });

  it('is case-insensitive about codes', async () => {
    const directory = new RedisRoomDirectory(makeRedis());
    await directory.claim('abc123', 'room-1');

    // A player types a code in whatever case they like; the key must not
    // depend on it.
    assert.ok(await directory.lookup('ABC123'));
    assert.ok(await directory.lookup('AbC123'));
  });

  it('returns null for an unknown code', async () => {
    const directory = new RedisRoomDirectory(makeRedis());
    assert.equal(await directory.lookup('ZZZZZZ'), null);
  });

  it('forgets a released room', async () => {
    const directory = new RedisRoomDirectory(makeRedis());
    await directory.claim('ABC123', 'room-1');
    await directory.release('ABC123');
    assert.equal(await directory.lookup('ABC123'), null);
  });

  it('sets an expiry so a crashed instance stops advertising its rooms', async () => {
    const redis = makeRedis();
    const directory = new RedisRoomDirectory(redis);
    await directory.claim('ABC123', 'room-1');

    const ttl = await redis.ttl('voidline:room:ABC123');
    assert.ok(ttl > 0, `expected a positive TTL, got ${ttl}`);
  });

  it('refreshes expiry on heartbeat', async () => {
    const redis = makeRedis();
    const directory = new RedisRoomDirectory(redis);

    await directory.claim('ABC123', 'room-1');
    await redis.expire('voidline:room:ABC123', 5);
    assert.equal(await redis.ttl('voidline:room:ABC123'), 5);

    await directory.heartbeat(['ABC123']);
    assert.ok((await redis.ttl('voidline:room:ABC123')) > 5, 'heartbeat should extend the TTL');
  });

  it('does nothing on an empty heartbeat', async () => {
    const directory = new RedisRoomDirectory(makeRedis());
    await assert.doesNotReject(() => directory.heartbeat([]));
  });

  it('survives a corrupt entry rather than throwing', async () => {
    const redis = makeRedis();
    const directory = new RedisRoomDirectory(redis);

    // Something else wrote to our key, or an old format is still around. A
    // lookup must fail closed, not take the process down.
    await redis.set('voidline:room:ABC123', 'not json');
    assert.equal(await directory.lookup('ABC123'), null);

    await redis.set('voidline:room:DEF456', JSON.stringify({ instanceId: 42 }));
    assert.equal(await directory.lookup('DEF456'), null);
  });

  it('does not throw when Redis rejects a command', async () => {
    // A directory failure must never stop a room being created; the room still
    // works on this instance, it is only unfindable from another.
    const broken = {
      set: () => Promise.reject(new Error('connection lost')),
      get: () => Promise.reject(new Error('connection lost')),
      del: () => Promise.reject(new Error('connection lost')),
      pipeline: () => ({ expire: () => {}, exec: () => Promise.reject(new Error('nope')) }),
    } as unknown as RedisClient;

    const directory = new RedisRoomDirectory(broken);
    await assert.doesNotReject(() => directory.claim('ABC123', 'room-1'));
    assert.equal(await directory.lookup('ABC123'), null);
    await assert.doesNotReject(() => directory.release('ABC123'));
    await assert.doesNotReject(() => directory.heartbeat(['ABC123']));
  });

  it('reports itself as distributed', () => {
    assert.equal(new RedisRoomDirectory(makeRedis()).isDistributed, true);
  });
});
