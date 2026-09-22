/**
 * Networking budget and abuse limits.
 *
 * These numbers are the contract for "how chatty is this game". The client uses
 * them to pace what it sends; the server uses the same numbers to decide what to
 * drop. Keeping both sides on one set of constants is what stops a well-behaved
 * client from being rate-limited by accident.
 */

/** Socket.IO namespace all gameplay traffic runs on. */
export const SOCKET_NAMESPACE = '/game';

/** Handshake auth key carrying the JWT access token. */
export const SOCKET_AUTH_TOKEN_KEY = 'token';

/* ------------------------------------------------------------------ rates - */

/**
 * How often the client sends its movement *intent* (a direction vector), not its
 * position. Intent is tiny and cannot be used to teleport, so this can stay low
 * without hurting responsiveness: the client predicts locally at full framerate.
 */
export const MOVEMENT_INPUT_HZ = 15;

/** Server simulation tick. */
export const SERVER_TICK_HZ = 20;

/**
 * How often the server broadcasts world state. Lower than the tick rate on
 * purpose - clients interpolate between snapshots rather than receiving every
 * tick, which roughly halves bandwidth with no visible cost.
 */
export const STATE_BROADCAST_HZ = 10;

export const MOVEMENT_INPUT_INTERVAL_MS = Math.round(1000 / MOVEMENT_INPUT_HZ);
export const SERVER_TICK_INTERVAL_MS = Math.round(1000 / SERVER_TICK_HZ);
export const STATE_BROADCAST_INTERVAL_MS = Math.round(1000 / STATE_BROADCAST_HZ);

/* ----------------------------------------------------------- reconnection - */

/**
 * How long a disconnected player keeps their seat, role, position and objective
 * progress. Past this the seat is released and the match continues without them.
 */
export const RECONNECT_GRACE_MS = 60_000;

/** How long a finished room lingers so late clients can still fetch results. */
export const ROOM_TEARDOWN_DELAY_MS = 120_000;

/** Timeout applied to acknowledged (critical) socket actions. */
export const ACK_TIMEOUT_MS = 8_000;

/* ------------------------------------------------------------------- chat - */

export const MAX_CHAT_MESSAGE_LENGTH = 200;

/** Messages per window, per player, per channel. */
export const CHAT_RATE_LIMIT = { messages: 5, windowMs: 5_000 } as const;

/* ----------------------------------------------------- generic abuse caps - */

/**
 * Global per-socket event ceiling. Anything above this is a broken or hostile
 * client; the server drops the excess and may disconnect a repeat offender.
 */
export const SOCKET_EVENT_RATE_LIMIT = { events: 60, windowMs: 1_000 } as const;

/** Ceiling on non-movement gameplay actions (interact, kill, report, vote). */
export const ACTION_RATE_LIMIT = { actions: 10, windowMs: 1_000 } as const;

/** REST rate limits, applied per IP by the API layer. */
export const HTTP_RATE_LIMITS = {
  auth: { requests: 10, windowMs: 60_000 },
  general: { requests: 120, windowMs: 60_000 },
} as const;

/* ---------------------------------------------------------- misc protocol - */

/**
 * Monotonic sequence attached to client input. The server uses it to discard
 * out-of-order and replayed packets, and to tell the client which input its
 * reconciliation snapshot accounts for.
 */
export const INPUT_SEQUENCE_MAX = 2 ** 31 - 1;

/** Pagination defaults for list endpoints (leaderboard, match history). */
export const PAGINATION = { defaultLimit: 25, maxLimit: 100 } as const;
