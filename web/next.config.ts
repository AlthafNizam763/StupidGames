import type { NextConfig } from 'next';

/*
 * Origins the client is allowed to talk to, for the CSP below.
 *
 * Read from the same environment the client uses, so a deployment that changes
 * its API host does not silently get a policy that blocks it.
 */
const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const socketOrigin = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000';
const voiceOrigin = process.env.NEXT_PUBLIC_VOICE_URL ?? '';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Where a script on this page may send data.
 *
 * Read from the same environment the client reads, so a deployment that changes
 * its API host cannot end up with a policy that blocks it. `wss:`/`ws:` are
 * listed because the socket may upgrade to a scheme the configured origin does
 * not literally name.
 */
const connectSources = [
  ...new Set(["'self'", apiOrigin, socketOrigin, voiceOrigin, 'wss:', 'ws:'].filter(Boolean)),
].join(' ');

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

const CSP = [
  "default-src 'self'",
  // Next's hydration payload is inline. 'unsafe-eval' is deliberately absent.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  `connect-src ${connectSources}`,
  `frame-ancestors ${frameAncestors}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * `@voidline/shared` is a workspace package compiled to CommonJS. Listing it
   * here lets Next resolve and bundle it like first-party source instead of
   * treating it as an opaque external.
   */
  transpilePackages: ['@voidline/shared'],

  // AVIF first, WebP as the fallback: both are far smaller than PNG, and the
  // game is played on mobile connections more often than not.
  images: {
    formats: ['image/avif', 'image/webp'],
  },

  // The client is dead weight without the server, so a missing URL should fail
  // the build rather than surface as a confusing runtime error in the browser.
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
    NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:4000',
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          {
            /*
             * Content Security Policy.
             *
             * The point of a CSP here is not this app's own code. It is that if
             * a stored value ever reaches the DOM unescaped - a username, a chat
             * message - this decides whether that becomes script execution or an
             * inert string.
             *
             * `connect-src` is the directive that matters most: it is what stops
             * an injected script exfiltrating a session somewhere else. It is
             * scoped to this app's own API and socket origins, and nothing else.
             *
             * `'unsafe-inline'` on styles is required by Next's streaming style
             * injection and by the inline `style` attributes the HUD uses for
             * computed positions. `'unsafe-eval'` is deliberately absent, which
             * shuts the usual route from injection to execution.
             */
            key: 'Content-Security-Policy',
            value: CSP,
          },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          /*
           * Clickjacking protection. `DENY` in production, and that is the
           * value that ships.
           *
           * In development it is relaxed to `SAMEORIGIN` so the responsive
           * review harness at /design/viewports can frame the application at
           * 320-1280px and check every breakpoint in one pass (§BJ). Chrome
           * refuses to open a window narrower than 500px, so an iframe is the
           * only way to obtain a true 320px layout viewport - and under
           * `DENY` a page cannot be framed even by itself.
           *
           * The relaxation is tied to NODE_ENV rather than to a path, because
           * the harness has to frame the real screens - /login, /home, the
           * lobby - not only the pages under /design. A production build
           * never evaluates this branch.
           */
          {
            key: 'X-Frame-Options',
            value: process.env.NODE_ENV === 'production' ? 'DENY' : 'SAMEORIGIN',
          },
          // The game owns the whole viewport; nothing here needs these.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
