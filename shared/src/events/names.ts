/**
 * Every socket event name, in one place.
 *
 * Names are `domain:action`. They exist as constants so a typo is a compile
 * error on both sides rather than an event that silently never fires.
 */

export const CLIENT_EVENT = {
  /* ---------------------------------------------------------------- room - */
  ROOM_CREATE: 'room:create',
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  ROOM_READY: 'room:ready',
  ROOM_SETTINGS: 'room:settings',
  ROOM_KICK: 'room:kick',
  ROOM_CLOSE: 'room:close',
  ROOM_START: 'room:start',

  /* -------------------------------------------------------------- player - */
  PLAYER_MOVE: 'player:move',
  PLAYER_ELIMINATE: 'player:eliminate',

  /* ---------------------------------------------------------------- task - */
  TASK_START: 'task:start',
  TASK_PROGRESS: 'task:progress',
  TASK_COMPLETE: 'task:complete',

  /* ------------------------------------------------------------ sabotage - */
  SABOTAGE_START: 'sabotage:start',
  SABOTAGE_REPAIR: 'sabotage:repair',

  /* ------------------------------------------------------- body/council - */
  BODY_REPORT: 'body:report',
  COUNCIL_EMERGENCY: 'council:emergency',
  COUNCIL_CHAT: 'council:chat',
  COUNCIL_VOTE: 'council:vote',

  /* --------------------------------------------------------------- game - */
  GAME_RESUME: 'game:resume',
} as const;
export type ClientEventName = (typeof CLIENT_EVENT)[keyof typeof CLIENT_EVENT];

export const SERVER_EVENT = {
  /* ---------------------------------------------------------------- room - */
  ROOM_STATE: 'room:state',
  ROOM_CLOSED: 'room:closed',
  ROOM_KICKED: 'room:kicked',

  /* ---------------------------------------------------------------- game - */
  GAME_START: 'game:start',
  GAME_STATE: 'game:state',
  GAME_DELTA: 'game:delta',
  GAME_SELF: 'game:self',
  GAME_TIMER: 'game:timer',
  GAME_RESULT: 'game:result',

  /* -------------------------------------------------------------- player - */
  PLAYER_STATE: 'player:state',
  PLAYER_CORRECTION: 'player:correction',
  PLAYER_ELIMINATED: 'player:eliminated',
  PLAYER_DISCONNECT: 'player:disconnect',
  PLAYER_RECONNECT: 'player:reconnect',

  /* ---------------------------------------------------------------- task - */
  TASK_UPDATED: 'task:updated',
  TASK_TEAM_PROGRESS: 'task:team',

  /* ------------------------------------------------------------ sabotage - */
  SABOTAGE_STARTED: 'sabotage:started',
  SABOTAGE_UPDATED: 'sabotage:updated',
  SABOTAGE_RESOLVED: 'sabotage:resolved',

  /* ------------------------------------------------------- body/council - */
  BODY_REPORTED: 'body:reported',
  COUNCIL_START: 'council:start',
  COUNCIL_CHAT: 'council:chat',
  COUNCIL_VOTING_OPEN: 'council:voting_open',
  COUNCIL_VOTE: 'council:vote',
  COUNCIL_RESULT: 'council:result',

  /* -------------------------------------------------------------- system - */
  /** Unsolicited failure, i.e. one with no ack to carry it. */
  ERROR: 'system:error',
} as const;
export type ServerEventName = (typeof SERVER_EVENT)[keyof typeof SERVER_EVENT];
