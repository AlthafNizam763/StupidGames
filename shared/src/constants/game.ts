/**
 * VOIDLINE - core game constants.
 *
 * Everything in this file is part of the client/server contract. The client MAY
 * read these values to render UI and to predict locally; the server treats them
 * as the ONLY source of truth. A client that disagrees with a bound here is
 * simply rejected - it is never trusted.
 *
 * Enum-like values are declared as const objects rather than TypeScript enums so
 * they survive isolatedModules transpilation in both the Next.js bundler and the
 * Node server without emitting runtime helper code.
 */

/* ------------------------------------------------------------------ roles - */

export const PlayerRole = {
  /** Loyal crew. Completes objectives, identifies Saboteurs, survives. */
  OPERATOR: 'OPERATOR',
  /** Hostile faction. Eliminates Operators and sabotages the facility. */
  SABOTEUR: 'SABOTEUR',
} as const;
export type PlayerRole = (typeof PlayerRole)[keyof typeof PlayerRole];

export const ALL_ROLES: readonly PlayerRole[] = [PlayerRole.OPERATOR, PlayerRole.SABOTEUR];

export const Team = {
  OPERATORS: 'OPERATORS',
  SABOTEURS: 'SABOTEURS',
} as const;
export type Team = (typeof Team)[keyof typeof Team];

export const ROLE_TEAM: Readonly<Record<PlayerRole, Team>> = {
  [PlayerRole.OPERATOR]: Team.OPERATORS,
  [PlayerRole.SABOTEUR]: Team.SABOTEURS,
};

/* ----------------------------------------------------------------- phases - */

/**
 * Authoritative game phases.
 *
 * Note on SABOTAGE: a *critical* sabotage (reactor breach, oxygen leak) puts the
 * room into the SABOTAGE phase because it runs a hard countdown that can end the
 * match on its own. Non-critical sabotages (comms, power, door lockdown) are
 * modifiers applied while the room stays in PLAYING - they never end the match,
 * so they do not deserve a phase of their own.
 */
export const GamePhase = {
  /** Room exists, host has not opened it for readiness yet. */
  WAITING: 'WAITING',
  /** Players joining, readying up, host tuning settings. */
  LOBBY: 'LOBBY',
  /** Roles dealt, countdown and role reveal running. No input accepted. */
  STARTING: 'STARTING',
  /** Free roam: movement, objectives, elimination, reporting. */
  PLAYING: 'PLAYING',
  /** A critical sabotage countdown is running over normal play. */
  SABOTAGE: 'SABOTAGE',
  /** Discussion. Movement frozen, chat open. */
  COUNCIL: 'COUNCIL',
  /** Ballots open. */
  VOTING: 'VOTING',
  /** Ejection reveal. */
  EJECTION: 'EJECTION',
  /** Win screen and XP award. */
  RESULTS: 'RESULTS',
  /** Terminal. Room is closed, or recycled back to LOBBY as a fresh match. */
  ENDED: 'ENDED',
} as const;
export type GamePhase = (typeof GamePhase)[keyof typeof GamePhase];

/**
 * The only legal phase transitions. The server rejects anything not listed here
 * instead of silently correcting it, so an illegal transition surfaces as a loud
 * bug rather than a quietly desynced room.
 */
export const GAME_PHASE_TRANSITIONS: Readonly<Record<GamePhase, readonly GamePhase[]>> = {
  [GamePhase.WAITING]: [GamePhase.LOBBY, GamePhase.ENDED],
  [GamePhase.LOBBY]: [GamePhase.STARTING, GamePhase.ENDED],
  [GamePhase.STARTING]: [GamePhase.PLAYING, GamePhase.LOBBY, GamePhase.ENDED],
  [GamePhase.PLAYING]: [GamePhase.SABOTAGE, GamePhase.COUNCIL, GamePhase.RESULTS, GamePhase.ENDED],
  [GamePhase.SABOTAGE]: [GamePhase.PLAYING, GamePhase.COUNCIL, GamePhase.RESULTS, GamePhase.ENDED],
  [GamePhase.COUNCIL]: [GamePhase.VOTING, GamePhase.ENDED],
  [GamePhase.VOTING]: [GamePhase.EJECTION, GamePhase.ENDED],
  [GamePhase.EJECTION]: [GamePhase.PLAYING, GamePhase.RESULTS, GamePhase.ENDED],
  [GamePhase.RESULTS]: [GamePhase.LOBBY, GamePhase.ENDED],
  [GamePhase.ENDED]: [],
};

export function canTransition(from: GamePhase, to: GamePhase): boolean {
  return GAME_PHASE_TRANSITIONS[from].includes(to);
}

/** Phases in which the world simulates and players may move. */
export const MOVEMENT_PHASES: readonly GamePhase[] = [GamePhase.PLAYING, GamePhase.SABOTAGE];

/** Phases in which a meeting is running: movement frozen, chat open. */
export const MEETING_PHASES: readonly GamePhase[] = [
  GamePhase.COUNCIL,
  GamePhase.VOTING,
  GamePhase.EJECTION,
];

export function isMovementPhase(phase: GamePhase): boolean {
  return MOVEMENT_PHASES.includes(phase);
}

export function isMeetingPhase(phase: GamePhase): boolean {
  return MEETING_PHASES.includes(phase);
}

/* --------------------------------------------------------------- outcomes - */

export const WinReason = {
  OBJECTIVES_COMPLETED: 'OBJECTIVES_COMPLETED',
  SABOTEURS_ELIMINATED: 'SABOTEURS_ELIMINATED',
  SABOTEURS_REACHED_PARITY: 'SABOTEURS_REACHED_PARITY',
  CRITICAL_SABOTAGE: 'CRITICAL_SABOTAGE',
  /** Every member of one side left and did not return within the grace period. */
  TEAM_ABANDONED: 'TEAM_ABANDONED',
} as const;
export type WinReason = (typeof WinReason)[keyof typeof WinReason];

/** Which side a reason awards the match to. TEAM_ABANDONED is resolved at runtime. */
export const WIN_REASON_TEAM: Readonly<Record<WinReason, Team | null>> = {
  [WinReason.OBJECTIVES_COMPLETED]: Team.OPERATORS,
  [WinReason.SABOTEURS_ELIMINATED]: Team.OPERATORS,
  [WinReason.SABOTEURS_REACHED_PARITY]: Team.SABOTEURS,
  [WinReason.CRITICAL_SABOTAGE]: Team.SABOTEURS,
  [WinReason.TEAM_ABANDONED]: null,
};

/* -------------------------------------------------------------- room code - */

/**
 * Room code alphabet. Deliberately excludes 0/O and 1/I/L so a code read aloud
 * or copied off a phone screen is unambiguous.
 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

/* --------------------------------------------------------------- settings - */

export const GameMode = {
  /** Full ruleset: objectives, sabotage, councils. */
  CLASSIC: 'CLASSIC',
  /** Shorter timers, fewer objectives, faster elimination cooldown. */
  RAPID: 'RAPID',
} as const;
export type GameMode = (typeof GameMode)[keyof typeof GameMode];

/** Inclusive numeric bounds for host-configurable room settings. */
export const SETTINGS_BOUNDS = {
  roomNameLength: { min: 3, max: 24 },
  maxPlayers: { min: 4, max: 15 },
  saboteurCount: { min: 1, max: 3 },
  /** Objectives assigned to each Operator. */
  objectiveCount: { min: 1, max: 10 },
  /** Seconds. */
  discussionTime: { min: 15, max: 120 },
  /** Seconds. */
  votingTime: { min: 15, max: 120 },
  /** Seconds. */
  killCooldown: { min: 10, max: 60 },
  /** Emergency meetings per player, per match. 0 disables them entirely. */
  emergencyMeetingLimit: { min: 0, max: 5 },
} as const;

export const DEFAULT_ROOM_SETTINGS = {
  maxPlayers: 8,
  saboteurCount: 2,
  objectiveCount: 7,
  discussionTime: 45,
  votingTime: 30,
  killCooldown: 25,
  emergencyMeetingLimit: 1,
  anonymousVoting: false,
  confirmEjection: true,
  gameMode: GameMode.CLASSIC,
} as const;

/** Minimum players required to start a match, regardless of maxPlayers. */
export const MIN_PLAYERS_TO_START = 4;

/**
 * Saboteurs must never start at or above parity with Operators, or the match is
 * over the instant it begins. This is the hard ceiling the server enforces.
 */
export function maxSaboteursFor(playerCount: number): number {
  return Math.max(
    SETTINGS_BOUNDS.saboteurCount.min,
    Math.min(SETTINGS_BOUNDS.saboteurCount.max, Math.floor((playerCount - 1) / 2)),
  );
}

/* ----------------------------------------------------------- world tuning - */

/** World units per second. The server clamps movement to this plus tolerance. */
export const PLAYER_BASE_SPEED = 140;

/** Collision radius of a player, in world units. */
export const PLAYER_RADIUS = 16;

/** Maximum distance at which a Saboteur may eliminate an Operator. */
export const ELIMINATION_RANGE = 64;

/** Maximum distance at which a body may be reported. */
export const REPORT_RANGE = 80;

/** Maximum distance at which an objective terminal may be used. */
export const INTERACT_RANGE = 56;

/**
 * Multiplier applied to PLAYER_BASE_SPEED before the server rejects a move as a
 * speed hack. Covers latency jitter and frame-time spikes without handing a
 * cheater useful headroom.
 */
export const MOVEMENT_SPEED_TOLERANCE = 1.25;

/** Any single positional delta beyond this is treated as a teleport attempt. */
export const MAX_POSITION_DELTA = 220;

/* --------------------------------------------------------------------- xp - */

/** Server-authoritative XP awards. The client never submits an XP value. */
export const XP_AWARDS = {
  MATCH_COMPLETED: 50,
  OBJECTIVE_COMPLETED: 15,
  WINNING_TEAM: 120,
  SURVIVED_TO_END: 40,
  SUCCESSFUL_ELIMINATION: 25,
  COUNCIL_PARTICIPATION: 10,
  CORRECT_EJECTION_VOTE: 20,
} as const;
export type XpAwardKey = keyof typeof XP_AWARDS;

/** Total XP required to reach a given level. Growth is quadratic. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return 100 * (level - 1) * level;
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  return level;
}

/* ------------------------------------------------------------ achievements - */

export const AchievementId = {
  FIRST_MATCH: 'FIRST_MATCH',
  FIRST_VICTORY: 'FIRST_VICTORY',
  PERFECT_OPERATOR: 'PERFECT_OPERATOR',
  MASTER_SABOTEUR: 'MASTER_SABOTEUR',
  OBJECTIVE_EXPERT: 'OBJECTIVE_EXPERT',
  SURVIVOR: 'SURVIVOR',
  INVESTIGATOR: 'INVESTIGATOR',
} as const;
export type AchievementId = (typeof AchievementId)[keyof typeof AchievementId];
