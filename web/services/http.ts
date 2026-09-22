import { ErrorCode, type ApiResponse, type FieldError } from '@voidline/shared';
import { env } from '@/lib/env';

/**
 * The REST client.
 *
 * Every server response uses one envelope (see API.md), so this is the only
 * place in the client that has to know about it. Callers get the unwrapped
 * `data` or an `ApiError` - they never branch on `success` themselves.
 */

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly fieldErrors: FieldError[];

  constructor(code: ErrorCode, message: string, status: number, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.fieldErrors = fieldErrors;
  }

  /** True when retrying the same request could plausibly succeed. */
  get isRetryable(): boolean {
    return (
      this.code === ErrorCode.SERVICE_UNAVAILABLE ||
      this.code === ErrorCode.INTERNAL_ERROR ||
      this.status === 0
    );
  }

  /** True when the user needs to sign in again. */
  get isAuthFailure(): boolean {
    return (
      this.code === ErrorCode.UNAUTHENTICATED ||
      this.code === ErrorCode.TOKEN_INVALID ||
      this.code === ErrorCode.TOKEN_EXPIRED
    );
  }

  /** Field errors as a map, ready to drop into form state. */
  fieldErrorMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const error of this.fieldErrors) map[error.path] = error.message;
    return map;
  }
}

/* -------------------------------------------------------------- auth hooks - */

type TokenProvider = () => string | null;
type RefreshHandler = () => Promise<boolean>;

let getAccessToken: TokenProvider = () => null;
let refreshSession: RefreshHandler | null = null;

/**
 * Registered by the session store once it exists (Phase 4). Until then the
 * client sends no Authorization header and does not attempt a refresh - it does
 * not pretend to be authenticated.
 */
export function configureAuth(options: {
  getAccessToken: TokenProvider;
  refreshSession: RefreshHandler;
}): void {
  getAccessToken = options.getAccessToken;
  refreshSession = options.refreshSession;
}

/* ---------------------------------------------------------------- request - */

export interface RequestOptions extends Omit<RequestInit, 'body' | 'method'> {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Query parameters. Undefined and null values are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Skips the Authorization header. Used by login and register. */
  anonymous?: boolean;
  /** Abort after this many ms. Defaults to 15s. */
  timeoutMs?: number;
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  const url = new URL(path.startsWith('/') ? path : `/${path}`, env.apiUrl);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function parseEnvelope<T>(response: Response): Promise<T> {
  let payload: ApiResponse<T> | null = null;

  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    // A non-JSON body means something upstream failed - a proxy, a gateway, a
    // crash before the error handler ran. There is no envelope to read.
    throw new ApiError(
      ErrorCode.INTERNAL_ERROR,
      'The server sent a response we could not read.',
      response.status,
    );
  }

  if (payload.success) return payload.data;

  throw new ApiError(payload.code, payload.message, response.status, payload.errors ?? []);
}

async function send<T>(path: string, options: RequestOptions, isRetry: boolean): Promise<T> {
  const { method = 'GET', body, query, anonymous, timeoutMs = 15_000, ...init } = options;

  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (body !== undefined) headers.set('Content-Type', 'application/json');

  if (!anonymous) {
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  // A hung request is worse than a failed one: the UI sits in a loading state
  // with nothing to show the player. Fail it and let them retry.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      ...init,
      method,
      headers,
      // Carries the httpOnly refresh cookie.
      credentials: 'include',
      signal: init.signal ?? controller.signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === 'AbortError';
    throw new ApiError(
      ErrorCode.SERVICE_UNAVAILABLE,
      aborted ? 'That took too long. Check your connection and try again.' : 'Could not reach the server.',
      0,
    );
  } finally {
    clearTimeout(timeout);
  }

  try {
    return await parseEnvelope<T>(response);
  } catch (error) {
    // One refresh attempt, once. Retrying repeatedly on a genuinely dead
    // session would loop the client against the server.
    if (error instanceof ApiError && error.code === ErrorCode.TOKEN_EXPIRED && !isRetry && refreshSession) {
      const refreshed = await refreshSession();
      if (refreshed) return send<T>(path, options, true);
    }
    throw error;
  }
}

export const http = {
  request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return send<T>(path, options, false);
  },
  get<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return send<T>(path, { ...options, method: 'GET' }, false);
  },
  post<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method'> = {}): Promise<T> {
    return send<T>(path, { ...options, method: 'POST', body }, false);
  },
  patch<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method'> = {}): Promise<T> {
    return send<T>(path, { ...options, method: 'PATCH', body }, false);
  },
  delete<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return send<T>(path, { ...options, method: 'DELETE' }, false);
  },
};

/** Narrows an unknown catch value to a message safe to show a player. */
export function toUserMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}
