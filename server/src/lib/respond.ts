import type { Response } from 'express';
import type { ApiFailure, ApiSuccess, ErrorCode, FieldError } from '@voidline/shared';

/**
 * The response envelope, in one place.
 *
 * Controllers call these rather than `res.json` directly, so every endpoint
 * returns the shape described in API.md. The client then has exactly one branch
 * to write, and adding a field to the envelope is a single edit here.
 */

export function ok<T>(res: Response, data: T, message = 'OK', status = 200): Response {
  const body: ApiSuccess<T> = { success: true, message, code: null, data };
  return res.status(status).json(body);
}

export function created<T>(res: Response, data: T, message = 'Created'): Response {
  return ok(res, data, message, 201);
}

/** No body to return, but the action succeeded. */
export function okEmpty(res: Response, message = 'OK'): Response {
  return ok<null>(res, null, message);
}

export function fail(
  res: Response,
  status: number,
  code: ErrorCode,
  message: string,
  fieldErrors?: FieldError[],
): Response {
  const body: ApiFailure = {
    success: false,
    message,
    code,
    data: null,
    // Omitted entirely when empty, rather than sent as [], so a client can
    // treat its presence as "this was a validation failure".
    ...(fieldErrors && fieldErrors.length > 0 ? { errors: fieldErrors } : {}),
  };
  return res.status(status).json(body);
}
