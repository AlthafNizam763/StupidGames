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
          { key: 'X-Frame-Options', value: 'DENY' },
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
