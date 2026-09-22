import type {
  AnimationState,
  ChatMessage,
  ConnectionState,
  DeadBody,
  Facing,
  GamePhase,
  MapData,
  MeetingState,
  PlayerRole,
  RoomSettings,
  SabotageState,
  TaskAssignment,
  Vec2,
  ZoneId,
} from '@voidline/shared';

/**
 * Authoritative match state.
 *
 * This is the truth. Every client's screen is a projection of it, filtered by
 * what that player is entitled to know - and the filtering happens on the way
 * out, in the serialisers, never by asking a client not to look.
 *
 * Held in memory for the life of the match (DATABASE.md). Written to MongoDB
 * exactly once, as a `Match` document, when it ends.
 */

export interface MatchPlayer {
  userId: string;
  username: string;
  avatar: string;
  level: number;

  /** Secret. Reaches only this player's own socket, and their allies'. */
  role: PlayerRole;

  alive: boolean;
  connection: ConnectionState;

  position: Vec2;
  /** Set from the last accepted input; integrated each tick. */
  velocity: Vec2;
  facing: Facing;
  animation: AnimationState;
  zone: ZoneId;

  /** Highest movement sequence accepted, for replay rejection. */
  lastInputSequence: number;
  /** Epoch ms of the last accepted input, for the speed check. */
  lastInputAt: number;

  /** Saboteurs only. */
  killCooldownEndsAt: number | null;

  emergencyMeetingsLeft: number;

  /** Operators only. Saboteurs get an empty list. */
  tasks: TaskAssignment[];

  /* ------------------------------------------------ match statistics - */
  objectivesCompleted: number;
  eliminations: number;
  /** Set at match end. */
  survived: boolean;
  /** Meetings this player spoke or voted in, for the participation award. */
  councilsParticipated: number;
  /** Times this player voted for someone who was ejected and was a Saboteur. */
  correctEjectionVotes: number;
  /** True if anybody ever voted for this player. Feeds MASTER_SABOTEUR. */
  everVotedFor: boolean;
  /** True if this player ever voted to eject an Operator. Feeds PERFECT_OPERATOR. */
  votedAgainstCrew: boolean;
}

/**
 * A puzzle the server issued and is waiting on.
 *
 * The answer lives here and nowhere else. It is never serialised into any
 * payload - which is what makes a SELECT puzzle unforgeable rather than merely
 * inconvenient to forge.
 */
export interface PendingPuzzle {
  taskId: string;
  playerId: string;
  step: number;
  answer: number[];
  issuedAt: number;
  minimumMs: number;
}

export interface Match {
  id: string;
  roomId: string;
  code: string;
  map: MapData;
  settings: RoomSettings;

  phase: GamePhase;
  /** Epoch ms the current phase ends, or null when it has no deadline. */
  phaseEndsAt: number | null;
  phaseStartedAt: number;

  players: Map<string, MatchPlayer>;
  bodies: DeadBody[];

  sabotage: SabotageState | null;
  /** Epoch ms the Saboteur team may sabotage again. */
  sabotageAvailableAt: number;
  /** Repair stations already operated for the active sabotage. */
  repairedStations: Set<string>;

  meeting: MeetingState | null;
  /** Keyed by `${playerId}:${taskId}:${step}`. */
  puzzles: Map<string, PendingPuzzle>;

  chat: ChatMessage[];

  /** Total objective steps across every Operator, and how many are done. */
  taskTotal: number;
  taskCompleted: number;

  startedAt: number;
  endedAt: number | null;
  /** Set once, when the match ends. Its presence means the match is over. */
  outcome: { winner: 'OPERATORS' | 'SABOTEURS'; reason: string } | null;
}

/** Everything the tick loop needs to tell the socket layer about. */
export interface MatchEvents {
  onSnapshot: (match: Match) => void;
  onDelta: (match: Match) => void;
  onSabotageUpdate: (match: Match) => void;
  onMeetingOpenVoting: (match: Match) => void;
  onMeetingResolved: (match: Match) => void;
  onMatchEnded: (match: Match) => void;
  onPhaseChange: (match: Match) => void;
}
