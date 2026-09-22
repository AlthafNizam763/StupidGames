import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z, type ZodError, type ZodType } from 'zod';
import type { FieldError } from '@voidline/shared';
import { errors } from '../lib/AppError';

/**
 * Input validation at the controller boundary.
 *
 * Nothing downstream re-checks a type, because nothing downstream ever sees an
 * unvalidated value. A service can take `RegisterInput` and trust it, which is
 * what keeps the rules layer free of defensive type checks.
 */

function toFieldErrors(error: ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

/**
 * Validates the request body and replaces it with the parsed result.
 *
 * The replacement matters: Zod strips unknown keys, so a handler cannot
 * accidentally read a field the schema does not declare - including one an
 * attacker added hoping it would be passed through to a database update.
 */
export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(errors.validation(toFieldErrors(result.error)));
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validates query parameters.
 *
 * `req.query` is a read-only getter in Express 5, so the parsed result is
 * attached to `res.locals.query` instead of overwriting it. Handlers read it
 * from there.
 */
export function validateQuery<T>(schema: ZodType<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(errors.validation(toFieldErrors(result.error)));
      return;
    }
    res.locals.query = result.data;
    next();
  };
}

export function validateParams<T>(schema: ZodType<T>): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(errors.validation(toFieldErrors(result.error)));
      return;
    }
    res.locals.params = result.data;
    next();
  };
}

/** Reads a value stashed by `validateQuery` / `validateParams`. */
export function validated<T>(res: Response, key: 'query' | 'params'): T {
  return res.locals[key] as T;
}

/** Pagination, shared by every list endpoint. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;
