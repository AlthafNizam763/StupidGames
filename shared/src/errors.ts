/**
 * Every error the client can be shown, as a stable machine-readable code.
 *
 * The client switches on `code` and never on `message`, so copy can change (or
 * be translated) without breaking behaviour. Production responses never carry a
 * stack trace - the code plus a human sentence is the entire contract.
 */
export const ErrorCode = {
  /* ------------------------------------------------------------- generic - */
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  /* ---------------------------------------------------------------- auth - */
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  ACCOUNT_DISABLED: 'ACCOUNT_DISABLED',
  RESET_TOKEN_INVALID: 'RESET_TOKEN_INVALID',

  /* --------------------------------------------------------------- rooms - */
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  ROOM_FULL: 'ROOM_FULL',
  ROOM_CLOSED: 'ROOM_CLOSED',
  ROOM_IN_PROGRESS: 'ROOM_IN_PROGRESS',
  ALREADY_IN_ROOM: 'ALREADY_IN_ROOM',
  NOT_IN_ROOM: 'NOT_IN_ROOM',
  NOT_HOST: 'NOT_HOST',
  INVALID_ROOM_CODE: 'INVALID_ROOM_CODE',
  INVALID_SETTINGS: 'INVALID_SETTINGS',
  NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
  PLAYERS_NOT_READY: 'PLAYERS_NOT_READY',
  KICKED_FROM_ROOM: 'KICKED_FROM_ROOM',

  /* ---------------------------------------------------------------- game - */
  WRONG_PHASE: 'WRONG_PHASE',
  PLAYER_DEAD: 'PLAYER_DEAD',
  TARGET_INVALID: 'TARGET_INVALID',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  COOLDOWN_ACTIVE: 'COOLDOWN_ACTIVE',
  NOT_SABOTEUR: 'NOT_SABOTEUR',
  TASK_NOT_ASSIGNED: 'TASK_NOT_ASSIGNED',
  TASK_ALREADY_COMPLETE: 'TASK_ALREADY_COMPLETE',
  TASK_VERIFICATION_FAILED: 'TASK_VERIFICATION_FAILED',
  SABOTAGE_ACTIVE: 'SABOTAGE_ACTIVE',
  SABOTAGE_NOT_ACTIVE: 'SABOTAGE_NOT_ACTIVE',
  MEETING_ACTIVE: 'MEETING_ACTIVE',
  MEETING_LIMIT_REACHED: 'MEETING_LIMIT_REACHED',
  ALREADY_VOTED: 'ALREADY_VOTED',
  VOTING_CLOSED: 'VOTING_CLOSED',
  MOVEMENT_REJECTED: 'MOVEMENT_REJECTED',

  /* ---------------------------------------------------------------- chat - */
  CHAT_NOT_ALLOWED: 'CHAT_NOT_ALLOWED',
  MESSAGE_TOO_LONG: 'MESSAGE_TOO_LONG',

  /* --------------------------------------------------------------- voice - */
  VOICE_UNAVAILABLE: 'VOICE_UNAVAILABLE',
  VOICE_NOT_PERMITTED: 'VOICE_NOT_PERMITTED',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Default HTTP status for each code. The API layer uses this so a controller
 * only has to pick a code, never a status - which keeps the two in sync.
 */
export const ERROR_HTTP_STATUS: Readonly<Record<ErrorCode, number>> = {
  INTERNAL_ERROR: 500,
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,

  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  TOKEN_EXPIRED: 401,
  TOKEN_INVALID: 401,
  EMAIL_TAKEN: 409,
  USERNAME_TAKEN: 409,
  ACCOUNT_DISABLED: 403,
  RESET_TOKEN_INVALID: 400,

  ROOM_NOT_FOUND: 404,
  ROOM_FULL: 409,
  ROOM_CLOSED: 409,
  ROOM_IN_PROGRESS: 409,
  ALREADY_IN_ROOM: 409,
  NOT_IN_ROOM: 403,
  NOT_HOST: 403,
  INVALID_ROOM_CODE: 400,
  INVALID_SETTINGS: 400,
  NOT_ENOUGH_PLAYERS: 409,
  PLAYERS_NOT_READY: 409,
  KICKED_FROM_ROOM: 403,

  WRONG_PHASE: 409,
  PLAYER_DEAD: 403,
  TARGET_INVALID: 400,
  OUT_OF_RANGE: 400,
  COOLDOWN_ACTIVE: 429,
  NOT_SABOTEUR: 403,
  TASK_NOT_ASSIGNED: 403,
  TASK_ALREADY_COMPLETE: 409,
  TASK_VERIFICATION_FAILED: 400,
  SABOTAGE_ACTIVE: 409,
  SABOTAGE_NOT_ACTIVE: 409,
  MEETING_ACTIVE: 409,
  MEETING_LIMIT_REACHED: 403,
  ALREADY_VOTED: 409,
  VOTING_CLOSED: 409,
  MOVEMENT_REJECTED: 400,

  CHAT_NOT_ALLOWED: 403,
  MESSAGE_TOO_LONG: 400,

  VOICE_UNAVAILABLE: 503,
  VOICE_NOT_PERMITTED: 403,
};

/** Fallback copy, used when a thrower does not supply its own sentence. */
export const ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = {
  INTERNAL_ERROR: 'Something went wrong on our side.',
  VALIDATION_ERROR: 'Some of the values you sent are not valid.',
  NOT_FOUND: 'Not found.',
  RATE_LIMITED: 'Too many requests. Slow down and try again.',
  SERVICE_UNAVAILABLE: 'That service is temporarily unavailable.',

  UNAUTHENTICATED: 'You need to sign in to do that.',
  INVALID_CREDENTIALS: 'That email or password is incorrect.',
  TOKEN_EXPIRED: 'Your session expired. Please sign in again.',
  TOKEN_INVALID: 'Your session is no longer valid.',
  EMAIL_TAKEN: 'That email is already registered.',
  USERNAME_TAKEN: 'That username is already taken.',
  ACCOUNT_DISABLED: 'This account has been disabled.',
  RESET_TOKEN_INVALID: 'That reset link is invalid or has expired.',

  ROOM_NOT_FOUND: 'No room with that code.',
  ROOM_FULL: 'Room is full.',
  ROOM_CLOSED: 'That room has been closed.',
  ROOM_IN_PROGRESS: 'That match has already started.',
  ALREADY_IN_ROOM: 'You are already in a room.',
  NOT_IN_ROOM: 'You are not in that room.',
  NOT_HOST: 'Only the host can do that.',
  INVALID_ROOM_CODE: 'That room code is not valid.',
  INVALID_SETTINGS: 'Those room settings are not valid.',
  NOT_ENOUGH_PLAYERS: 'Not enough players to start.',
  PLAYERS_NOT_READY: 'Everyone needs to be ready first.',
  KICKED_FROM_ROOM: 'You were removed from that room.',

  WRONG_PHASE: 'You cannot do that right now.',
  PLAYER_DEAD: 'You cannot do that while eliminated.',
  TARGET_INVALID: 'That target is not valid.',
  OUT_OF_RANGE: 'You are too far away.',
  COOLDOWN_ACTIVE: 'That is still on cooldown.',
  NOT_SABOTEUR: 'Only a Saboteur can do that.',
  TASK_NOT_ASSIGNED: 'That objective is not assigned to you.',
  TASK_ALREADY_COMPLETE: 'That objective is already complete.',
  TASK_VERIFICATION_FAILED: 'That objective was not solved correctly.',
  SABOTAGE_ACTIVE: 'A sabotage is already running.',
  SABOTAGE_NOT_ACTIVE: 'There is nothing to repair.',
  MEETING_ACTIVE: 'A council is in session.',
  MEETING_LIMIT_REACHED: 'You have no emergency meetings left.',
  ALREADY_VOTED: 'You have already voted.',
  VOTING_CLOSED: 'Voting has closed.',
  MOVEMENT_REJECTED: 'Movement rejected.',

  CHAT_NOT_ALLOWED: 'You cannot speak on that channel right now.',
  MESSAGE_TOO_LONG: 'That message is too long.',

  VOICE_UNAVAILABLE: 'Voice chat is not available.',
  VOICE_NOT_PERMITTED: 'You cannot use voice right now.',
};
