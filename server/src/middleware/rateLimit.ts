import rateLimit, { type Options } from 'express-rate-limit';
import { ERROR_HTTP_STATUS, ERROR_MESSAGES, ErrorCode, HTTP_RATE_LIMITS } from '@voidline/shared';
import { fail } from '../lib/respond';
import { logger } from '../lib/logger';

/**
 * Per-IP request limits.
 *
 * The numbers come from the shared contract, so the client knows the same
 * budget the server enforces and a well-behaved client is never limited by
 * accident (SOCKET_EVENTS.md covers the equivalent socket limits).
 *
 * A limited request returns the standard envelope rather than the library's
 * default plain-text body - otherwise the client hits its one branch of
 * response handling and finds something it cannot parse.
 */

function build(limit: { requests: number; windowMs: number }, name: string) {
  const options: Partial<Options> = {
    windowMs: limit.windowMs,
    limit: limit.requests,
    // `RateLimit-*` headers, not the deprecated `X-RateLimit-*` ones.
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn({ requestId: req.id, ip: req.ip, limiter: name }, 'rate limit exceeded');
      fail(
        res,
        ERROR_HTTP_STATUS[ErrorCode.RATE_LIMITED],
        ErrorCode.RATE_LIMITED,
        ERROR_MESSAGES[ErrorCode.RATE_LIMITED],
      );
    },
  };
  return rateLimit(options);
}

/** Tight limit for credential endpoints: 10 per minute. */
export const authLimiter = build(HTTP_RATE_LIMITS.auth, 'auth');

/** General API limit: 120 per minute. */
export const generalLimiter = build(HTTP_RATE_LIMITS.general, 'general');
