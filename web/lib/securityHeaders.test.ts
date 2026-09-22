import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCsp } from './securityHeaders';

/**
 * The Content Security Policy (§48).
 *
 * This file exists because of a specific shipped bug: the policy went out with
 * `connect-src` missing, which under `default-src 'self'` would have blocked
 * every API call and the socket upgrade. Nothing caught it - not the type
 * checker, not the linter, not three hundred tests - because a header is just a
 * string, and no other code reads it.
 *
 * So these assertions are about the *string*, and each one corresponds to a way
 * the game breaks or a way an injected script gets out.
 */

const origins = {
  apiOrigin: 'https://api.voidline.example',
  socketOrigin: 'wss://socket.voidline.example',
  voiceOrigin: '',
};

/** Splits a policy into directive -> sources, so tests can assert precisely. */
function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split('; ').map((part) => {
      const [name, ...sources] = part.split(' ');
      return [name!, sources];
    }),
  );
}

describe('buildCsp', () => {
  it('lets the client reach its own API and socket', () => {
    const connect = directives(buildCsp({ isProduction: true, ...origins })).get('connect-src');

    /*
     * The regression that motivated this file. Without `connect-src` the
     * directive falls back to `default-src 'self'` and the client cannot talk
     * to its own backend at all.
     */
    assert.ok(connect, 'connect-src is missing - the client cannot reach its own server');
    assert.ok(connect.includes(origins.apiOrigin), 'the API origin is not reachable');
    assert.ok(connect.includes(origins.socketOrigin), 'the socket origin is not reachable');
    // The socket may upgrade to a scheme the configured origin does not name.
    assert.ok(connect.includes('wss:'));
  });

  it('omits an unconfigured voice origin rather than emitting an empty source', () => {
    const connect = directives(buildCsp({ isProduction: true, ...origins })).get('connect-src')!;
    assert.equal(
      connect.some((source) => source === ''),
      false,
      'an empty string in a source list silently truncates the directive',
    );
  });

  it('includes a configured voice origin', () => {
    const connect = directives(
      buildCsp({ isProduction: true, ...origins, voiceOrigin: 'https://voice.example' }),
    ).get('connect-src')!;
    assert.ok(connect.includes('https://voice.example'));
  });

  it('never allows eval in production', () => {
    const script = directives(buildCsp({ isProduction: true, ...origins })).get('script-src')!;

    /*
     * The directive that decides whether an injected string can become running
     * code. Everything else in this policy is depth; this is the door.
     */
    assert.equal(script.includes("'unsafe-eval'"), false, "production allowed 'unsafe-eval'");
  });

  it('allows eval in development, for the HMR runtime', () => {
    const script = directives(buildCsp({ isProduction: false, ...origins })).get('script-src')!;
    assert.ok(
      script.includes("'unsafe-eval'"),
      'without this every dev page loads with a CSP violation, which teaches everyone to ignore the issue indicator',
    );
  });

  it('refuses to be framed in production and allows it in development', () => {
    // 'none' in production: the game embeds nothing and is embedded nowhere.
    assert.deepEqual(
      directives(buildCsp({ isProduction: true, ...origins })).get('frame-ancestors'),
      ["'none'"],
    );
    // 'self' in development, for the responsive review harness, which needs
    // iframes to obtain a true 320px layout viewport.
    assert.deepEqual(
      directives(buildCsp({ isProduction: false, ...origins })).get('frame-ancestors'),
      ["'self'"],
    );
  });

  it('keeps the directives that make an injection inert', () => {
    const parsed = directives(buildCsp({ isProduction: true, ...origins }));

    assert.deepEqual(parsed.get('default-src'), ["'self'"]);
    assert.deepEqual(parsed.get('object-src'), ["'none'"]);
    assert.deepEqual(parsed.get('base-uri'), ["'self'"]);
    // Stops an injected form posting a session somewhere else.
    assert.deepEqual(parsed.get('form-action'), ["'self'"]);
  });

  it('produces a policy a browser can parse', () => {
    const csp = buildCsp({ isProduction: true, ...origins });

    assert.equal(csp.includes(';;'), false, 'an empty directive');
    assert.equal(csp.includes('  '), false, 'a doubled separator, which hides a dropped source');
    assert.equal(csp.trim(), csp);
    for (const [name, sources] of directives(csp)) {
      assert.ok(name.length > 0, 'a directive with no name');
      assert.ok(sources.length > 0, `${name} has no sources`);
    }
  });
});
