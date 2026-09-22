import type { ErrorCode } from '../errors';

/** ISO-8601 timestamp string, e.g. "2026-09-22T11:00:00.000Z". */
export type ISODateString = string;

/** Milliseconds since the Unix epoch. Used for anything the client counts down. */
export type EpochMs = number;

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * The single response envelope for every REST endpoint. Success and failure use
 * the same shape so the client has exactly one branch to write.
 */
export interface ApiSuccess<T> {
  success: true;
  message: string;
  code: null;
  data: T;
}

export interface ApiFailure {
  success: false;
  message: string;
  code: ErrorCode;
  data: null;
  /** Field-level validation detail. Present only for validation failures. */
  errors?: FieldError[];
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface FieldError {
  /** Dot path into the submitted body, e.g. "settings.saboteurCount". */
  path: string;
  message: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

/**
 * Acknowledgement returned by critical socket actions. Same two-branch shape as
 * the REST envelope, minus the parts a socket call does not need.
 */
export type AckResponse<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; message: string };

export type Ack<T = void> = (response: AckResponse<T>) => void;
