import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * A real MongoDB for integration tests.
 *
 * `mongodb-memory-server` downloads and runs an actual `mongod`, so these tests
 * exercise real unique indexes, real collation, real TTL behaviour and real
 * query semantics. A mocked repository would pass while the unique index that
 * actually prevents duplicate registrations was missing.
 *
 * The first run downloads a binary (~100MB) and is slow; later runs reuse the
 * cache.
 */

let memoryServer: MongoMemoryServer | null = null;

export async function startTestDatabase(): Promise<void> {
  memoryServer = await MongoMemoryServer.create();
  await mongoose.connect(memoryServer.getUri(), { autoIndex: true });

  // Index builds are asynchronous. Without waiting, an early test can insert a
  // duplicate before the unique index exists and get a false pass.
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).syncIndexes()));
}

export async function stopTestDatabase(): Promise<void> {
  await mongoose.disconnect();
  await memoryServer?.stop();
  memoryServer = null;
}

/** Empties every collection between tests, keeping indexes intact. */
export async function clearTestDatabase(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}
