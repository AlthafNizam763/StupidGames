import { ERROR_HTTP_STATUS, ERROR_MESSAGES, ErrorCode, type FieldError } from '@voidline/shared';

/**
 * The one error type the API throws.
 *
 * A thrower picks an `ErrorCode` and, optionally, a sentence. It never picks an
 * HTTP status - that comes from `ERROR_HTTP_STATUS` in the shared contract, so
 * the status a client sees and the code it branches on cannot drift apart.
 *
 * Anything that is NOT an AppError reaching the error handler is treated as a
 * bug: it is logged in full and reported to the client as a bare
 * INTERNAL_ERROR, because an unplanned error message may contain internals.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fieldErrors: FieldError[];
  /** Detail for the log only. Never serialised to a response. */
  readonly context: Record<string, unknown> | undefined;

  constructor(
    code: ErrorCode,
    message?: string,
    options: { fieldErrors?: FieldError[]; context?: Record<string, unknown>; cause?: unknown } = {},
  ) {
    super(message ?? ERROR_MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_HTTP_STATUS[code];
    this.fieldErrors = options.fieldErrors ?? [];
    this.context = options.context;
    if (options.cause !== undefined) this.cause = options.cause;
    Error.captureStackTrace?.(this, AppError);
  }

  /** True for 5xx: our fault, and worth an error-level log line. */
  get isServerFault(): boolean {
    return this.status >= 500;
  }
}

/* Shorthands for the codes thrown most often. Each exists so a call site reads
   as the thing that went wrong, not as an error-construction ceremony. */

export const errors = {
  validation: (fieldErrors: FieldError[], message?: string) =>
    new AppError(ErrorCode.VALIDATION_ERROR, message, { fieldErrors }),

  notFound: (what = 'Resource', context?: Record<string, unknown>) =>
    new AppError(ErrorCode.NOT_FOUND, `${what} not found.`, { context }),

  unauthenticated: (message?: string) => new AppError(ErrorCode.UNAUTHENTICATED, message),

  internal: (cause: unknown, context?: Record<string, unknown>) =>
    new AppError(ErrorCode.INTERNAL_ERROR, undefined, { cause, context }),
};

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
