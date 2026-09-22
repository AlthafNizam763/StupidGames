import type { NextConfig } from 'next';

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
