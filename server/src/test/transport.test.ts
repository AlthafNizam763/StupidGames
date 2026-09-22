import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

/**
 * Every server endpoint is reachable from the client, and vice versa.
 *
 * This exists because of a named pattern rather than a single bug. Three times
 * a server capability shipped before the client method that reaches it existed
 * - `appearance` on `updateMe`, then friend-request-by-username, then the
 * blocked list - and once an entire feature did: the voice endpoints were built
 * in Phase 24 and had no client service at all until this test was written.
 *
 * Nothing fails when that happens. No type breaks, no test goes red, no request
 * 404s. The capability is simply invisible, and the only way anyone finds out
 * is by trying to build a screen on it. The transport layer is the seam between
 * the two halves of this project, and it is the one place where "done on the
 * server" and "reachable from a screen" drift apart in silence.
 *
 * So this reads both sides as text and compares them. It is deliberately not
 * clever: parsing the route tables and the service modules with regular
 * expressions is crude, but it needs no running server, no build step and no
 * network, and it fails loudly the moment the two sides disagree.
 *
 * If this test is failing, one of three things is true: an endpoint was added
 * without its client method, a client method points at a route that does not
 * exist, or an endpoint is deliberately server-only and belongs in
 * SERVER_ONLY below with a reason.
 */

const ROUTES_DIR = join(__dirname, '..', 'routes');
const SERVICES_DIR = join(__dirname, '..', '..', '..', 'web', 'services');

/**
 * Endpoints with no client method, on purpose.
 *
 * Each needs a reason. "Nothing calls it yet" is not one - that is the drift
 * this test exists to catch.
 */
const SERVER_ONLY = new Map<string, string>([
  [
    'GET /health',
    'Liveness for the hosting platform, not the app. No envelope and no auth, so the client http layer could not consume it anyway.',
  ],
]);

/** Path parameters are named differently on each side, so they are flattened. */
function normalise(endpoint: string): string {
  return endpoint.replace(/:[A-Za-z_]+|\$\{[^}]+\}/g, ':p');
}

function serverEndpoints(): Set<string> {
  const mounts = new Map<string, string>();
  const index = readFileSync(join(ROUTES_DIR, 'index.ts'), 'utf8');

  for (const match of index.matchAll(/use\(\s*'([^']+)'\s*,\s*(\w+)/g)) {
    mounts.set(match[2]!, match[1]!);
  }

  const found = new Set<string>();

  for (const file of readdirSync(ROUTES_DIR)) {
    if (file === 'index.ts' || !file.endsWith('.ts')) continue;
    const source = readFileSync(join(ROUTES_DIR, file), 'utf8');

    for (const match of source.matchAll(/(\w+)\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)) {
      const [, router, method, path] = match;
      const prefix = mounts.get(router!);
      // A router nothing mounts is unreachable however well it is written.
      assert.ok(prefix, `router "${router}" in ${file} is never mounted in routes/index.ts`);

      const full = `/api${prefix}${path === '/' ? '' : path}`.replace(/\/+/g, '/');
      found.add(`${method!.toUpperCase()} ${full}`);
    }
  }

  return found;
}

function clientEndpoints(): Set<string> {
  const found = new Set<string>();

  for (const file of readdirSync(SERVICES_DIR)) {
    if (!file.endsWith('.ts')) continue;
    const source = readFileSync(join(SERVICES_DIR, file), 'utf8');

    for (const match of source.matchAll(
      /http\.(get|post|put|patch|delete)(?:<[^>]*>)?\(\s*[`']([^`']+)/g,
    )) {
      found.add(`${match[1]!.toUpperCase()} ${match[2]!}`);
    }
  }

  return found;
}

describe('the transport seam', () => {
  it('finds routes on both sides, so a silent parse failure cannot pass this suite', () => {
    // Without this, a change to how routes are declared would empty both sets
    // and every assertion below would hold vacuously.
    assert.ok(serverEndpoints().size > 20, 'parsed suspiciously few server routes');
    assert.ok(clientEndpoints().size > 20, 'parsed suspiciously few client calls');
  });

  it('exposes every server endpoint through a client method', () => {
    const client = new Set([...clientEndpoints()].map(normalise));

    const unreachable = [...serverEndpoints()]
      .filter((endpoint) => !client.has(normalise(endpoint)))
      .filter((endpoint) => !SERVER_ONLY.has(endpoint))
      .sort();

    assert.deepEqual(
      unreachable,
      [],
      `these endpoints exist but no screen can reach them:\n  ${unreachable.join('\n  ')}\n` +
        'Add the method to web/services, or list it in SERVER_ONLY with a reason.',
    );
  });

  it('points every client method at a route that exists', () => {
    const server = new Set([...serverEndpoints()].map(normalise));

    const dangling = [...clientEndpoints()]
      .filter((endpoint) => !server.has(normalise(endpoint)))
      .sort();

    /*
     * This direction fails at runtime rather than silently - a 404 in the
     * browser - but it fails in front of a player rather than in CI, and a
     * renamed route is easy to miss on the other side of the repository.
     */
    assert.deepEqual(
      dangling,
      [],
      `these client calls have no matching route:\n  ${dangling.join('\n  ')}`,
    );
  });

  it('keeps a reason for anything deliberately left unreachable', () => {
    for (const [endpoint, reason] of SERVER_ONLY) {
      assert.ok(
        reason.length > 30,
        `${endpoint} is excluded without a real reason - "not called yet" is the drift this test catches`,
      );
    }
  });
});
