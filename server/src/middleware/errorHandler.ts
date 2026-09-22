import type { NextFunction, Request, Response } from 'express';
import { ERROR_HTTP_STATUS, ERROR_MESSAGES, ErrorCode, type FieldError } from '@voidline/shared';
import { AppError, isAppError } from '../lib/AppError';
import { fail } from '../lib/respond';
import { logger } from '../lib/logger';

/**
 * The single exit point for every failure.
 *
 * Two rules govern what a client is told:
 *
 * 1. An `AppError` is deliberate. Its code and message were chosen to be read
 *    by a player, so both are sent.
 * 2. Anything else is a bug. It is logged in full and reported as a bare
 *    INTERNAL_ERROR, because an unplanned error message may contain a file
 *    path, a query, or a connection string.
 *
 * A stack trace never reaches a response in any environment. The correlation id
 * does, which is what ties a support report to the real log line.
 */

interface MongoServerError extends Error {
  code?: number;
  keyPattern?: Record<string, unknown>;
}

/** Maps the database errors worth translating into something a player can act on. */
function fromDatabaseError(error: unknown): AppError | null {
  if (!(error instanceof Error)) return null;

  // Mongoose validation failure - a schema rule the request layer did not catch.
  if (error.name === 'ValidationError') {
    const fieldErrors: FieldError[] = Object.entries(
      (error as unknown as { errors?: Record<string, { message?: string }> }).errors ?? {},
    ).map(([path, detail]) => ({ path, message: detail?.message ?? 'Invalid value.' }));
    return new AppError(ErrorCode.VALIDATION_ERROR, undefined, { fieldErrors, cause: error });
  }

  // A malformed ObjectId in a path parameter is a bad request, not a crash.
  if (error.name === 'CastError') {
    return new AppError(ErrorCode.VALIDATION_ERROR, 'That identifier is not valid.', {
      cause: error,
    });
  }

  const mongoError = error as MongoServerError;
  if (mongoError.code === 11000) {
    const field = Object.keys(mongoError.keyPattern ?? {})[0];
    // The unique-index violations that have a player-facing meaning get their
    // own code; anything else is a generic conflict.
    if (field === 'email') return new AppError(ErrorCode.EMAIL_TAKEN, undefined, { cause: error });
    if (field === 'username')
      return new AppError(ErrorCode.USERNAME_TAKEN, undefined, { cause: error });
    return new AppError(ErrorCode.VALIDATION_ERROR, 'That value is already in use.', {
      fieldErrors: field ? [{ path: field, message: 'Already in use.' }] : [],
      cause: error,
    });
  }

  return null;
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Express cannot change a response whose headers are already sent; handing it
  // back lets the default handler close the connection.
  if (res.headersSent) {
    next(error);
    return;
  }

  const appError = isAppError(error)
    ? error
    : (fromDatabaseError(error) ??
      new AppError(ErrorCode.INTERNAL_ERROR, undefined, { cause: error }));

  const logPayload = {
    requestId: req.id,
    method: req.method,
    url: req.originalUrl,
    code: appError.code,
    status: appError.status,
    context: appError.context,
    err: appError.isServerFault ? (appError.cause ?? appError) : undefined,
  };

  if (appError.isServerFault) {
    logger.error(logPayload, appError.message);
  } else {
    logger.warn(logPayload, appError.message);
  }

  // For a server fault, discard the thrown message and send the generic one.
  const clientMessage = appError.isServerFault
    ? ERROR_MESSAGES[ErrorCode.INTERNAL_ERROR]
    : appError.message;

  fail(res, appError.status, appError.code, clientMessage, appError.fieldErrors);
}

/** Terminal 404 for any route that matched nothing. */
export function notFoundHandler(req: Request, res: Response): void {
  fail(
    res,
    ERROR_HTTP_STATUS[ErrorCode.NOT_FOUND],
    ErrorCode.NOT_FOUND,
    `No endpoint matches ${req.method} ${req.path}.`,
  );
}
