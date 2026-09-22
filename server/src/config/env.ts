import { randomBytes } from 'node:crypto';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Environment loading and validation.
 *
 * The process refuses to start on bad configuration rather than discovering it
 * at the first request. A server that boots with a missing MONGODB_URI and only
 * fails when a player tries to sign in is far harder to diagnose than one that
 * says so on line one of the log.
 *
 * This schema covers what the server actually uses today. Later phases extend
 * it as they add configuration - validating a variable nothing reads yet would
 * only block startup for no reason.
 */

// The repository keeps a single .env at its root, shared by both workspaces.
// Three levels up from here is that root, from `src/config` and `dist/config`
// alike.
dotenv.config({ path: path.resolve(__dirname, '../../../.env'), quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  PORT: z.coerce.number().int().min(1).max(65535).default(4000),

  /** Comma-separated list of origins allowed to call the API. */
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/voidline'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /*
   * Optional. Unset means single-instance with in-memory rooms, which is the
   * right setup for development and a single-region launch. Set it and the
   * Socket.IO adapter and room directory both go distributed (DEPLOYMENT.md).
   */
  REDIS_URL: z.string().optional(),

  /*
   * Token signing. Access and refresh use *different* secrets so a token minted
   * for one purpose cannot be replayed as the other (SECURITY.md).
   *
   * 32 characters is the floor, not a recommendation - generate 48 random bytes:
   *   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   */
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),
  JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  /* Password reset delivery. With no SMTP host the mailer logs instead. */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('no-reply@voidline.local'),

  /* Voice chat. Unset or 'none' means voice is off and the UI hides it. */
  VOICE_PROVIDER: z.enum(['none', 'livekit', 'agora', 'daily', 'webrtc']).default('none'),
  VOICE_API_KEY: z.string().optional(),
  VOICE_API_SECRET: z.string().optional(),
  VOICE_SERVER_URL: z.string().optional(),

  /** Where password-reset links point. The web client's origin. */
  WEB_APP_URL: z.string().default('http://localhost:3000'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');

  // Written straight to stderr: the logger is configured from this very object,
  // so it does not exist yet at this point.
  process.stderr.write(
    `\nVOIDLINE server cannot start - invalid environment:\n${issues}\n\n` +
      `Copy .env.example to .env and fill it in. See DEPLOYMENT.md.\n\n`,
  );
  process.exit(1);
}

const raw = parsed.data;

/**
 * Token secrets.
 *
 * In production both are mandatory - a server that signs sessions with a
 * predictable key has no authentication at all, so this refuses to start.
 *
 * In development a missing secret is filled with 48 genuinely random bytes and
 * a loud warning. That is real entropy, not a fixed fallback, so nothing is
 * weakened; the trade is that every restart invalidates existing sessions,
 * which the warning says outright. The alternative - a hard-coded development
 * default - is exactly the value that eventually ships to production.
 */
function resolveSecret(name: string, value: string | undefined): string {
  if (value) return value;

  if (raw.NODE_ENV === 'production') {
    process.stderr.write(
      `\nVOIDLINE server cannot start: ${name} is required in production.\n` +
        `Generate one with:\n` +
        `  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"\n\n`,
    );
    process.exit(1);
  }

  process.stderr.write(
    `\n[voidline] WARNING: ${name} is not set. Using a random secret for this ` +
      `process only - every restart will sign out every user. Set ${name} in .env ` +
      `to keep sessions across restarts.\n\n`,
  );
  return randomBytes(48).toString('base64url');
}

export const config = {
  nodeEnv: raw.NODE_ENV,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  port: raw.PORT,
  logLevel: raw.LOG_LEVEL,
  mongodbUri: raw.MONGODB_URI,
  redisUrl: raw.REDIS_URL && raw.REDIS_URL.trim().length > 0 ? raw.REDIS_URL.trim() : null,

  /**
   * Parsed once at startup. An empty entry would match nothing and a trailing
   * slash would silently fail to match a browser Origin header, so both are
   * cleaned up here rather than in the CORS check.
   */
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean),

  webAppUrl: raw.WEB_APP_URL.replace(/\/$/, ''),

  auth: {
    jwtSecret: resolveSecret('JWT_SECRET', raw.JWT_SECRET),
    jwtRefreshSecret: resolveSecret('JWT_REFRESH_SECRET', raw.JWT_REFRESH_SECRET),
    accessTokenTtl: raw.JWT_EXPIRES_IN,
    refreshTokenTtl: raw.JWT_REFRESH_EXPIRES_IN,
  },

  voice: {
    provider: raw.VOICE_PROVIDER,
    apiKey: raw.VOICE_API_KEY,
    apiSecret: raw.VOICE_API_SECRET,
    serverUrl: raw.VOICE_SERVER_URL,
  },

  mail: {
    /** With no host configured the mailer logs the message instead of sending. */
    host: raw.SMTP_HOST,
    port: raw.SMTP_PORT,
    user: raw.SMTP_USER,
    password: raw.SMTP_PASSWORD,
    from: raw.MAIL_FROM,
    isConfigured: Boolean(raw.SMTP_HOST),
  },
} as const;

export type Config = typeof config;
