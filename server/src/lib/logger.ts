import pino from 'pino';
import { config } from '../config/env';

/**
 * Structured logging.
 *
 * JSON in production, because that is what a log platform can query. Readable
 * lines in development, because that is what a person can scan. `pino-pretty`
 * is a devDependency and is only referenced on the development branch, so a
 * production image never needs it installed.
 *
 * Redaction is deliberately broad: a stray `console.log(req.body)` during
 * development is how passwords end up in a log file forever.
 */
export const logger = pino({
  // Tests assert on behaviour, not on log output, and a passing suite that
  // prints a hundred lines of INFO hides the failures that matter.
  level: config.isTest ? 'silent' : config.logLevel,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
    ],
    censor: '[redacted]',
  },
  ...(config.isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});

export type Logger = typeof logger;
