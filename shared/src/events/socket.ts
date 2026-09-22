import type { ErrorCode } from '../errors';
import type { Ack } from '../types/common';
import type {
  BodyReportInput,
  EliminationEvent,
  GameResumeState,
  GameSelfState,
  GameSnapshot,
  MovementDelta,
  PhaseTimer,
} from '../types/game';
import type {
  CastVote,
  ChatMessage,
  ChatSendInput,
  MeetingState,
  VoteInput,
  VotingResult,
} from '../types/meeting';
import type { MatchResult } from '../types/match';
import type {
  MovementCorrection,
  MovementInput,
  PlayerId,
  PublicPlayerState,
} from '../types/player';
import type { CreateRoomInput, RoomCode, RoomSettings, RoomState } from '../types/room';
import type { SabotageState } from '../types/sabotage';
import type {
  TaskAssignment,
  TaskCompletedEvent,
  TaskId,
  TaskSubmission,
  TeamTaskProgress,
} from '../types/task';
import type { SabotageType } from '../types/sabotage';
import type { UserId } from '../types/user';

/**
 * Events the client may emit.
 *
 * Everything that changes authoritative state takes an acknowledgement, so the
 * client learns whether its intent was accepted instead of guessing from a
 * subsequent broadcast. The one exception is PLAYER_MOVE: it fires many times a
 * second, and an ack per frame would cost more than it is worth. Rejected
 * movement is corrected by PLAYER_CORRECTION instead.
 */
export interface ClientToServerEvents {
  'room:create': (input: CreateRoomInput, ack: Ack<RoomState>) => void;
  'room:join': (input: { code: RoomCode }, ack: Ack<RoomState>) => void;
  'room:leave': (ack: Ack) => void;
  'room:ready': (input: { ready: boolean }, ack: Ack) => void;
  'room:settings': (input: Partial<RoomSettings>, ack: Ack<RoomState>) => void;
  'room:kick': (input: { userId: UserId }, ack: Ack) => void;
  'room:close': (ack: Ack) => void;
  'room:start': (ack: Ack) => void;

  'player:move': (input: MovementInput) => void;
  'player:eliminate': (input: { targetId: PlayerId }, ack: Ack) => void;

  'task:start': (input: { taskId: TaskId }, ack: Ack<TaskAssignment>) => void;
  'task:progress': (input: TaskSubmission, ack: Ack<TaskAssignment>) => void;
  'task:complete': (input: TaskSubmission, ack: Ack<TaskCompletedEvent>) => void;

  'sabotage:start': (input: { type: SabotageType }, ack: Ack<SabotageState>) => void;
  'sabotage:repair': (input: { stationId: string }, ack: Ack<SabotageState | null>) => void;

  'body:report': (input: BodyReportInput, ack: Ack) => void;
  'council:emergency': (ack: Ack) => void;
  'council:chat': (input: ChatSendInput, ack: Ack<ChatMessage>) => void;
  'council:vote': (input: VoteInput, ack: Ack) => void;

  /** Requested after a reconnect to rebuild the client from server state. */
  'game:resume': (ack: Ack<GameResumeState>) => void;
}

/** Events the server may emit. */
export interface ServerToClientEvents {
  'room:state': (state: RoomState) => void;
  'room:closed': (payload: { reason: string }) => void;
  'room:kicked': (payload: { by: UserId }) => void;

  /** Match begins. Carries the public snapshot plus this socket's private slice. */
  'game:start': (payload: { snapshot: GameSnapshot; self: GameSelfState }) => void;
  'game:state': (snapshot: GameSnapshot) => void;
  'game:delta': (delta: MovementDelta) => void;
  'game:self': (self: GameSelfState) => void;
  'game:timer': (timer: PhaseTimer) => void;
  'game:result': (result: MatchResult) => void;

  'player:state': (player: PublicPlayerState) => void;
  'player:correction': (correction: MovementCorrection) => void;
  'player:eliminated': (event: EliminationEvent) => void;
  'player:disconnect': (payload: { playerId: PlayerId }) => void;
  'player:reconnect': (payload: { playerId: PlayerId }) => void;

  /** This socket's own objective list. Never contains another player's tasks. */
  'task:updated': (tasks: TaskAssignment[]) => void;
  'task:team': (progress: TeamTaskProgress) => void;

  'sabotage:started': (sabotage: SabotageState) => void;
  'sabotage:updated': (sabotage: SabotageState) => void;
  'sabotage:resolved': (payload: { type: SabotageType }) => void;

  'body:reported': (payload: { bodyId: string; reporterId: PlayerId }) => void;
  'council:start': (meeting: MeetingState) => void;
  'council:chat': (message: ChatMessage) => void;
  'council:voting_open': (payload: { meetingId: string; endsAt: number }) => void;
  'council:vote': (vote: CastVote) => void;
  'council:result': (result: VotingResult) => void;

  'system:error': (payload: { code: ErrorCode; message: string }) => void;
}

/** Reserved for the Redis adapter when the server scales horizontally. */
export interface InterServerEvents {
  ping: () => void;
}

/**
 * Per-socket server-side context, populated at handshake from the verified JWT.
 * Nothing here is ever read from the client payload.
 */
export interface SocketData {
  userId: UserId;
  username: string;
  /** Set once the socket joins a room. */
  roomId: string | null;
  roomCode: RoomCode | null;
  /** Last accepted movement sequence, for replay rejection. */
  lastInputSequence: number;
}
