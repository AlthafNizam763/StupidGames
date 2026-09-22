/**
 * Security header construction, as a pure function.
 *
 * Extracted from next.config.ts so it can be tested. That is not a matter of
 * taste: this policy shipped once with `connect-src` missing entirely, because
 * an editing mistake left a stray comma in the source array and `.filter(Boolean)`
 * dropped it silently. Under `default-src 'self'` that policy would have blocked
 * every API call and the Socket.IO upgrade - the whole game, dead on arrival -
 * and type-check, lint and the entire test suite stayed green through it.
 *
 * A header is a string built at module load. Nothing else in the codebase will
 * notice if it is the wrong string, so it needs a test of its own.
 */

export interface CspOptions {
  isProduction: boolean;
  apiOrigin: string;
  socketOrigin: string;
  /** Empty when voice is not configured, in which case it is simply omitted. */
  voiceOrigin: string;
}

export function buildCsp({
  isProduction,
  apiOrigin,
  socketOrigin,
  voiceOrigin,
}: CspOptions): string {
  /*
   * Where a script on this page may send data.
   *
   * Read from the same environment the client reads, so a deployment that
   * changes its API host cannot end up with a policy that blocks it. `wss:`/`ws:`
   * are listed because the socket may upgrade to a scheme the configured origin
   * does not literally name.
   */
  const connectSources = [
    ...new Set(["'self'", apiOrigin, socketOrigin, voiceOrigin, 'wss:', 'ws:'].filter(Boolean)),
  ].join(' ');

  /*
   * Production is `'self' 'unsafe-inline'` - inline because Next's hydration
   * payload is a `<script>` tag of serialised props, and there is no build hook
   * that will nonce it for us. `'unsafe-eval'` is deliberately absent, and that
   * is the directive that actually matters: it shuts the usual route from an
   * injected string to executing code.
   *
   * Development adds `'unsafe-eval'`, because Turbopack's HMR runtime evaluates
   * module code at runtime. Without it every dev page loads with a CSP violation
   * and Next's issue indicator lit, which trains everyone working on the app to
   * ignore that indicator - and it is the same indicator that reports real
   * problems. The production branch is what ships.
   */
  const scriptSources = isProduction
    ? "'self' 'unsafe-inline'"
    : "'self' 'unsafe-inline' 'unsafe-eval'";

  /*
   * `frame-ancestors` overrides X-Frame-Options where both are present.
   *
   * Production is 'none' - the game embeds nothing and is embedded nowhere. In
   * development it is 'self', because the responsive review harness at
   * /design/viewports frames the app in iframes to get true narrow layout
   * viewports, and 'none' would silently break it. That harness is 404 in
   * production, so the two settings never overlap.
   */
  const frameAncestors = isProduction ? "'none'" : "'self'";

  return [
    "default-src 'self'",
    `script-src ${scriptSources}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    `connect-src ${connectSources}`,
    `frame-ancestors ${frameAncestors}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}
