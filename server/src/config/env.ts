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

export const config = {
  nodeEnv: raw.NODE_ENV,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  port: raw.PORT,
  logLevel: raw.LOG_LEVEL,
  mongodbUri: raw.MONGODB_URI,

  /**
   * Parsed once at startup. An empty entry would match nothing and a trailing
   * slash would silently fail to match a browser Origin header, so both are
   * cleaned up here rather than in the CORS check.
   */
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean),
} as const;

export type Config = typeof config;
