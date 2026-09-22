import {
  ChatChannel,
  ErrorCode,
  MeetingTrigger,
  SERVER_EVENT,
  SKIP_VOTE,
  type AckResponse,
  type ChatMessage,
  type GameResumeState,
  type TaskCompletedEvent,
  type TaskPuzzle,
  type VoteTarget,
} from '@voidline/shared';
import { AppError } from '../lib/AppError';
import { logger } from '../lib/logger';
import { eliminate, reportBody } from '../game/KillManager';
import { applyInput } from '../game/MovementManager';
import { castVote, canCallEmergency, composeMessage, recipientsFor } from '../game/MeetingManager';
import { repair, startSabotage } from '../game/SabotageManager';
import { openTask, submitStep, teamProgress } from '../game/TaskManager';
import { toSelfState, toSnapshot } from '../game/match/serialise';
import type { MatchManager } from '../game/match/MatchManager';
import type { SabotageState } from '@voidline/shared';
import type { Match, MatchPlayer } from '../game/match/types';

/**
 * Gameplay socket handlers.
 *
 * Every one of these is a thin translation: validate the payload, resolve the
 * player from the socket's authenticated identity, call a manager, fan out the
 * result. No rule is decided here - the managers own the rules, and this file
 * owns who is told what.
 *
 * The recurring shape is deliberate. A handler that reached into match state
 * directly would be a second place the rules live, and the two would drift.
 */

export interface GameContext {
  matches: MatchManager;
  /** Emits to every socket in a room. */
  toRoom: (roomId: string, event: string, payload: unknown) => void;
  /** Emits to one player's sockets, wherever they are. */
  toPlayer: (userId: string, event: string, payload: unknown) => void;
}

function requireMatch(context: GameContext, roomId: string | null): Match {
  if (!roomId) throw new AppError(ErrorCode.NOT_IN_ROOM);
  const match = context.matches.byRoom(roomId);
  if (!match) throw new AppError(ErrorCode.WRONG_PHASE, 'No match is running in this room.');
  return match;
}

function requirePlayer(match: Match, userId: string): MatchPlayer {
  const player = match.players.get(userId);
  if (!player) throw new AppError(ErrorCode.NOT_IN_ROOM);
  return player;
}

/** Maps a manager's error enum onto the shared error code the client branches on. */
function fail(code: ErrorCode, message?: string): never {
  throw new AppError(code, message);
}

/* --------------------------------------------------------- movement - */

export function handleMove(
  context: GameContext,
  userId: string,
  roomId: string | null,
  input: unknown,
): void {
  if (!roomId) return;
  const match = context.matches.byRoom(roomId);
  if (!match) return;

  const player = match.players.get(userId);
  if (!player) return;

  /*
   * Movement is fire-and-forget: no acknowledgement, and a rejected input is
   * simply ignored. It fires fifteen times a second, and an ack per input
   * would cost more than the input is worth. Genuine drift is corrected by
   * `player:correction` instead.
   */
  applyInput(match, player, input as never);
}

/* ------------------------------------------------------------ tasks - */

export function handleTaskStart(
  context: GameContext,
  userId: string,
  roomId: string | null,
  taskId: string,
): TaskPuzzle {
  const match = requireMatch(context, roomId);
  const player = requirePlayer(match, userId);

  const result = openTask(match, player, taskId);
  if (!result.ok) {
    switch (result.error) {
      case 'OUT_OF_RANGE':
        fail(ErrorCode.OUT_OF_RANGE);
        break;
      case 'ALREADY_COMPLETE':
        fail(ErrorCode.TASK_ALREADY_COMPLETE);
        break;
      case 'NOT_ASSIGNED':
      case 'NOT_OPERATOR':
        // A Saboteur gets the same error an Operator would get for someone
        // else's task. Distinguishing them would confirm their own role to a
        // modified client - which it already knows, but there is no reason to
        // add a second confirmation.
        fail(ErrorCode.TASK_NOT_ASSIGNED);
        break;
      case 'DEAD':
        fail(ErrorCode.PLAYER_DEAD);
        break;
      default:
        fail(ErrorCode.WRONG_PHASE);
    }
  }

  return (result as { ok: true; puzzle: TaskPuzzle }).puzzle;
}

export function handleTaskStep(
  context: GameContext,
  userId: string,
  roomId: string | null,
  payload: { taskId: string; step: number; values: number[] },
): { next: TaskPuzzle | null; completed: TaskCompletedEvent | null } {
  const match = requireMatch(context, roomId);
  const player = requirePlayer(match, userId);

  const result = submitStep(match, player, payload.taskId, payload.step, payload.values);

  if (!result.ok) {
    switch (result.error) {
      case 'WRONG_ANSWER':
        fail(ErrorCode.TASK_VERIFICATION_FAILED);
        break;
      case 'TOO_FAST':
        fail(ErrorCode.TASK_VERIFICATION_FAILED, 'That was faster than the system can respond.');
        break;
      case 'OUT_OF_RANGE':
        fail(ErrorCode.OUT_OF_RANGE);
        break;
      case 'ALREADY_COMPLETE':
        fail(ErrorCode.TASK_ALREADY_COMPLETE);
        break;
      case 'DEAD':
        fail(ErrorCode.PLAYER_DEAD);
        break;
      default:
        fail(ErrorCode.TASK_NOT_ASSIGNED);
    }
  }

  const { task, completed, next } = (result as { ok: true; result: never }).result as {
    task: { id: string };
    completed: boolean;
    next: TaskPuzzle | null;
  };

  // The team bar moves for everyone; the task list is this player's alone.
  context.toRoom(match.roomId, SERVER_EVENT.TASK_TEAM_PROGRESS, teamProgress(match));
  context.toPlayer(userId, SERVER_EVENT.TASK_UPDATED, player.tasks);

  if (completed) {
    context.matches.checkOutcome(match);
    return {
      next: null,
      completed: { taskId: task.id, playerId: userId, team: teamProgress(match) },
    };
  }

  return { next, completed: null };
}

/* ------------------------------------------------------- elimination - */

export function handleEliminate(
  context: GameContext,
  userId: string,
  roomId: string | null,
  targetId: string,
): void {
  const match = requireMatch(context, roomId);
  const killer = requirePlayer(match, userId);

  const result = eliminate(match, killer, targetId);
  if (!result.ok) {
    switch (result.error) {
      case 'NOT_SABOTEUR':
        fail(ErrorCode.NOT_SABOTEUR);
        break;
      case 'COOLDOWN':
        fail(ErrorCode.COOLDOWN_ACTIVE);
        break;
      case 'OUT_OF_RANGE':
        fail(ErrorCode.OUT_OF_RANGE);
        break;
      case 'TARGET_INVALID':
        fail(ErrorCode.TARGET_INVALID);
        break;
      case 'DEAD':
        fail(ErrorCode.PLAYER_DEAD);
        break;
      case 'MEETING_ACTIVE':
        fail(ErrorCode.MEETING_ACTIVE);
        break;
      default:
        fail(ErrorCode.WRONG_PHASE);
    }
  }

  const { outcome } = result as { ok: true; outcome: { victimId: string; bodyId?: string; body: { id: string } } };

  /*
   * The victim, and only the victim.
   *
   * There is no branch here that sends the killer's identity to anyone. The
   * killer learns their cooldown reset from their own `game:self`; everybody
   * else learns that somebody died.
   */
  context.toRoom(match.roomId, SERVER_EVENT.PLAYER_ELIMINATED, {
    victimId: outcome.victimId,
    bodyId: outcome.body.id,
  });

  context.toPlayer(userId, SERVER_EVENT.GAME_SELF, toSelfState(match, killer));
  context.toRoom(match.roomId, SERVER_EVENT.GAME_STATE, toSnapshot(match));
  context.matches.checkOutcome(match);
}

/* ---------------------------------------------------------- sabotage - */

export function handleSabotage(
  context: GameContext,
  userId: string,
  roomId: string | null,
  type: string,
): SabotageState {
  const match = requireMatch(context, roomId);
  const actor = requirePlayer(match, userId);

  const result = startSabotage(match, actor, type as never);
  if (!result.ok) {
    switch (result.error) {
      case 'NOT_SABOTEUR':
        fail(ErrorCode.NOT_SABOTEUR);
        break;
      case 'COOLDOWN':
        fail(ErrorCode.COOLDOWN_ACTIVE);
        break;
      case 'ALREADY_ACTIVE':
        fail(ErrorCode.SABOTAGE_ACTIVE);
        break;
      case 'MEETING_ACTIVE':
        fail(ErrorCode.MEETING_ACTIVE);
        break;
      case 'DEAD':
        fail(ErrorCode.PLAYER_DEAD);
        break;
      default:
        fail(ErrorCode.WRONG_PHASE);
    }
  }

  const sabotage = (result as { ok: true; sabotage: SabotageState }).sabotage;

  // Identical for both teams. The payload names no actor, so an Operator's
  // client has nothing to reveal even if it wanted to.
  context.toRoom(match.roomId, SERVER_EVENT.SABOTAGE_STARTED, sabotage);
  context.toRoom(match.roomId, SERVER_EVENT.GAME_STATE, toSnapshot(match));

  return sabotage;
}

export function handleRepair(
  context: GameContext,
  userId: string,
  roomId: string | null,
  stationId: string,
): SabotageState | null {
  const match = requireMatch(context, roomId);
  const player = requirePlayer(match, userId);

  const result = repair(match, player, stationId);
  if (!result.ok) {
    switch (result.error) {
      case 'NOT_ACTIVE':
        fail(ErrorCode.SABOTAGE_NOT_ACTIVE);
        break;
      case 'OUT_OF_RANGE':
        fail(ErrorCode.OUT_OF_RANGE);
        break;
      case 'DEAD':
        fail(ErrorCode.PLAYER_DEAD);
        break;
      default:
        fail(ErrorCode.TARGET_INVALID);
    }
  }

  const sabotage = (result as { ok: true; sabotage: SabotageState | null }).sabotage;

  if (sabotage === null) {
    context.toRoom(match.roomId, SERVER_EVENT.SABOTAGE_RESOLVED, { type: 'REPAIRED' });
  } else {
    context.toRoom(match.roomId, SERVER_EVENT.SABOTAGE_UPDATED, sabotage);
  }

  context.toRoom(match.roomId, SERVER_EVENT.GAME_STATE, toSnapshot(match));
  return sabotage;
}

/* --------------------------------------------------- bodies, council - */

export function handleReport(
  context: GameContext,
  userId: string,
  roomId: string | null,
  bodyId: string,
): void {
  const match = requireMatch(context, roomId);
  const reporter = requirePlayer(match, userId);

  const result = reportBody(match, reporter, bodyId);
  if (!result.ok) {
    switch (result.error) {
      case 'OUT_OF_RANGE':
        fail(ErrorCode.OUT_OF_RANGE);
        break;
      case 'ALREADY_REPORTED':
      case 'NOT_FOUND':
        fail(ErrorCode.TARGET_INVALID);
        break;
      case 'DEAD':
        fail(ErrorCode.PLAYER_DEAD);
        break;
      case 'MEETING_ACTIVE':
        fail(ErrorCode.MEETING_ACTIVE);
        break;
      default:
        fail(ErrorCode.WRONG_PHASE);
    }
  }

  const body = (result as { ok: true; body: { playerId: string } }).body;

  context.toRoom(match.roomId, SERVER_EVENT.BODY_REPORTED, { bodyId, reporterId: userId });
  context.matches.beginMeeting(match, reporter, MeetingTrigger.BODY_REPORT, body.playerId);
}

export function handleEmergency(
  context: GameContext,
  userId: string,
  roomId: string | null,
): void {
  const match = requireMatch(context, roomId);
  const caller = requirePlayer(match, userId);

  const allowed = canCallEmergency(match, caller);
  if (!allowed.ok) {
    switch (allowed.error) {
      case 'NO_MEETINGS_LEFT':
        fail(ErrorCode.MEETING_LIMIT_REACHED);
        break;
      case 'ALREADY_ACTIVE':
        fail(ErrorCode.MEETING_ACTIVE);
        break;
      case 'DEAD':
        fail(ErrorCode.PLAYER_DEAD);
        break;
      default:
        fail(ErrorCode.WRONG_PHASE);
    }
  }

  context.matches.beginMeeting(match, caller, MeetingTrigger.EMERGENCY, null);
}

export function handleChat(
  context: GameContext,
  userId: string,
  roomId: string | null,
  body: string,
): ChatMessage {
  const match = requireMatch(context, roomId);
  const sender = requirePlayer(match, userId);

  const result = composeMessage(match, sender, body);
  if (!result.ok) {
    if (result.error === 'TOO_LONG') fail(ErrorCode.MESSAGE_TOO_LONG);
    fail(ErrorCode.CHAT_NOT_ALLOWED);
  }

  const message = (result as { ok: true; message: ChatMessage }).message;
  match.chat.push(message);

  /*
   * Fan-out is computed, not broadcast-and-filter.
   *
   * A living player is never in the recipient list for a DEAD message, so the
   * message is never written to their socket. There is no channel they could
   * subscribe to, and nothing for a patched client to reveal.
   */
  for (const recipient of recipientsFor(match, message)) {
    context.toPlayer(recipient.userId, SERVER_EVENT.COUNCIL_CHAT, message);
  }

  return message;
}

export function handleVote(
  context: GameContext,
  userId: string,
  roomId: string | null,
  meetingId: string,
  target: VoteTarget,
): void {
  const match = requireMatch(context, roomId);
  const voter = requirePlayer(match, userId);

  const result = castVote(match, voter, meetingId, target);
  if (!result.ok) {
    switch (result.error) {
      case 'ALREADY_VOTED':
        fail(ErrorCode.ALREADY_VOTED);
        break;
      case 'CLOSED':
      case 'WRONG_PHASE':
        fail(ErrorCode.VOTING_CLOSED);
        break;
      case 'TARGET_INVALID':
        fail(ErrorCode.TARGET_INVALID);
        break;
      case 'DEAD':
        fail(ErrorCode.PLAYER_DEAD);
        break;
      default:
        fail(ErrorCode.NOT_IN_ROOM);
    }
  }

  // Already redacted by `castVote` when the room votes anonymously: the target
  // is absent from the payload, not present and hidden.
  context.toRoom(match.roomId, SERVER_EVENT.COUNCIL_VOTE, (result as { vote: unknown }).vote);

  // Ends voting early once everyone has voted, rather than making the last
  // voter wait out a timer nobody needs.
  context.matches.maybeResolveVotingEarly(match);
}

/* ------------------------------------------------------- reconnection - */

/**
 * Rebuilds a returning player's client from server state (§29).
 *
 * The whole truth in one payload: the public snapshot, this player's private
 * slice, and the chat they missed on channels they are entitled to read. The
 * client replaces its state with this rather than trying to reconcile what it
 * had before the drop - it has no way to know what happened while it was away.
 */
export function handleResume(
  context: GameContext,
  userId: string,
  roomId: string | null,
): GameResumeState {
  const match = requireMatch(context, roomId);
  const player = requirePlayer(match, userId);

  const entitled = match.chat.filter((message) => {
    if (message.channel === ChatChannel.DEAD) return !player.alive;
    if (message.channel === ChatChannel.SABOTEUR) return player.role === 'SABOTEUR';
    return true;
  });

  logger.info({ matchId: match.id, userId }, 'player resumed match');

  return {
    snapshot: toSnapshot(match),
    self: toSelfState(match, player),
    // Bounded: a long match could otherwise push a few hundred messages at a
    // client that only needs the recent context.
    missedMessages: entitled.slice(-50),
  };
}

/** Convenience for handlers that answer with nothing. */
export function ackOk<T>(ack: ((response: AckResponse<T>) => void) | undefined, data: T): void {
  ack?.({ ok: true, data });
}

export { SKIP_VOTE };
