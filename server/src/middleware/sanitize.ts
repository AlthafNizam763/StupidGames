import type { NextFunction, Request, Response } from 'express';
import { ErrorCode } from '@voidline/shared';
import { AppError } from '../lib/AppError';

/**
 * Rejects payloads carrying MongoDB operator syntax.
 *
 * `express-mongo-sanitize` is the usual choice here, but it rewrites
 * `req.query` in place - and in Express 5 `req.query` is a read-only getter, so
 * that library throws on this stack. It is also unmaintained.
 *
 * This rejects rather than strips, which is the better behaviour anyway: a
 * request containing `{"email": {"$ne": null}}` is not a request with a typo in
 * it, and silently rewriting it into something that "works" hides an attack
 * that should be visible in the logs.
 *
 * Note this is defence in depth, not the primary control. The real protection
 * is that every endpoint parses its input with a Zod schema, so a value that
 * should be a string can never arrive as an object (SECURITY.md).
 */

const MAX_DEPTH = 8;

function findSuspectKey(value: unknown, depth = 0): string | null {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return null;

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findSuspectKey(entry, depth + 1);
      if (found) return found;
    }
    return null;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    // `$` starts an operator; `.` traverses into a nested document path.
    if (key.startsWith('$') || key.includes('.')) return key;
    const found = findSuspectKey(nested, depth + 1);
    if (found) return found;
  }

  return null;
}

export function rejectMongoOperators(req: Request, _res: Response, next: NextFunction): void {
  // `req.query` is read here, never written - reading is safe on Express 5.
  for (const source of [req.body, req.query, req.params]) {
    const suspect = findSuspectKey(source);
    if (suspect) {
      next(
        new AppError(ErrorCode.VALIDATION_ERROR, 'That request contained a disallowed field name.', {
          context: { suspectKey: suspect, path: req.originalUrl },
        }),
      );
      return;
    }
  }

  next();
}
