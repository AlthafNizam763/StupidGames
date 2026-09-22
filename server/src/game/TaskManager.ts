import { randomInt } from 'node:crypto';
import {
  INTERACT_RANGE,
  PlayerRole,
  PuzzleKind,
  TaskStatus,
  TaskType,
  type MapData,
  type PuzzlePrompt,
  type TaskAssignment,
  type TaskPuzzle,
  type TeamTaskProgress,
} from '@voidline/shared';
import { distanceBetween } from './MovementManager';
import type { Match, MatchPlayer, PendingPuzzle } from './match/types';

/**
 * Objectives (§18).
 *
 * The server generates each puzzle, keeps the answer, and verifies the
 * submission. The client receives only what it needs to draw the puzzle - which
 * is the difference between an objective a modified client cannot fake and one
 * it merely finds inconvenient.
 *
 * Multi-step objectives issue one puzzle per step. A step is only accepted
 * while the player is alive, in range of the right terminal, in a phase that
 * allows work, and has not already completed it.
 */

/** How the seven objective types are shaped. */
const PUZZLE_SHAPES: Readonly<
  Record<TaskType, { kind: PuzzleKind; slots: number; steps: number; duration: number }>
> = {
  [TaskType.REACTOR_CALIBRATION]: { kind: PuzzleKind.ALIGN, slots: 4, steps: 2, duration: 8 },
  [TaskType.SIGNAL_ROUTING]: { kind: PuzzleKind.ORDER, slots: 5, steps: 1, duration: 10 },
  [TaskType.OXYGEN_BALANCING]: { kind: PuzzleKind.ALIGN, slots: 3, steps: 1, duration: 7 },
  [TaskType.DATA_RECOVERY]: { kind: PuzzleKind.ORDER, slots: 6, steps: 2, duration: 12 },
  [TaskType.POWER_SYNCHRONIZATION]: { kind: PuzzleKind.ALIGN, slots: 3, steps: 2, duration: 9 },
  [TaskType.SECURITY_SCAN]: { kind: PuzzleKind.SELECT, slots: 4, steps: 1, duration: 9 },
  [TaskType.NAVIGATION_CALIBRATION]: { kind: PuzzleKind.ALIGN, slots: 2, steps: 1, duration: 6 },
};

/**
 * Minimum solve time, per slot.
 *
 * An ALIGN puzzle shows its own answer - the challenge is doing it, not knowing
 * it - so the only thing separating a player from a script is how fast a human
 * can physically complete it. This is the floor below which the server stops
 * believing the submission. It is a speed bump, not a wall, and the honest
 * position is in the shared puzzle docs.
 */
const MINIMUM_MS_PER_SLOT = 260;

function minimumMsFor(slots: number): number {
  return slots * MINIMUM_MS_PER_SLOT;
}

/* --------------------------------------------------------- assignment - */

/**
 * Deals objectives to the Operators.
 *
 * Saboteurs get none: they cannot advance the bar, and handing them a list
 * would be a list they have to pretend to work. Their pretending is done at the
 * terminals, which accept them and then refuse the submission.
 *
 * Terminals are dealt round-robin from a shuffled list so the crew spreads out
 * rather than all being sent to Reactor Core.
 */
export function assignTasks(match: Match, objectiveCount: number): void {
  const terminals = match.map.terminals;
  if (terminals.length === 0) return;

  let total = 0;

  for (const player of match.players.values()) {
    if (player.role !== PlayerRole.OPERATOR) {
      player.tasks = [];
      continue;
    }

    const shuffled = shuffleTerminals(terminals);
    const count = Math.min(objectiveCount, shuffled.length);
    const tasks: TaskAssignment[] = [];

    for (let i = 0; i < count; i++) {
      const terminal = shuffled[i]!;
      const shape = PUZZLE_SHAPES[terminal.type];

      tasks.push({
        id: `${player.userId}:${terminal.id}`,
        type: terminal.type,
        zone: terminal.zone,
        terminalId: terminal.id,
        duration: shape.duration,
        steps: shape.steps,
        progress: 0,
        status: TaskStatus.PENDING,
      });

      total += shape.steps;
    }

    player.tasks = tasks;
  }

  match.taskTotal = total;
  match.taskCompleted = 0;
}

function shuffleTerminals<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    const a = out[i]!;
    out[i] = out[j]!;
    out[j] = a;
  }
  return out;
}

/* ------------------------------------------------------------ puzzles - */

/**
 * Generates a puzzle and its answer.
 *
 * The answer is returned separately from the prompt so the caller has to make a
 * deliberate choice about what to send - rather than the answer sitting on the
 * object that gets serialised and being one careless spread away from the wire.
 */
export function generatePuzzle(
  task: TaskAssignment,
): { prompt: PuzzlePrompt; answer: number[] } {
  const shape = PUZZLE_SHAPES[task.type];
  const minimumSeconds = minimumMsFor(shape.slots) / 1000;

  switch (shape.kind) {
    case PuzzleKind.ALIGN: {
      // Targets are the puzzle. Public by necessity.
      const answer = Array.from({ length: shape.slots }, () => randomInt(0, 100));
      return {
        answer,
        prompt: {
          kind: PuzzleKind.ALIGN,
          slots: shape.slots,
          options: [],
          targets: [...answer],
          duration: shape.duration,
          minimumSeconds,
        },
      };
    }

    case PuzzleKind.ORDER: {
      // The player is shown scrambled values and must return them sorted.
      const values = uniqueValues(shape.slots);
      const scrambled = shuffleTerminals(values);
      return {
        answer: [...values].sort((a, b) => a - b),
        prompt: {
          kind: PuzzleKind.ORDER,
          slots: shape.slots,
          options: scrambled,
          duration: shape.duration,
          minimumSeconds,
        },
      };
    }

    case PuzzleKind.SELECT:
    default: {
      /*
       * The only genuinely unforgeable shape: the answer is a subset the client
       * is never told. A modified client can submit, but cannot know what to
       * submit, so it has to actually solve the puzzle it was shown.
       */
      const options = uniqueValues(shape.slots * 3);
      const answer = shuffleTerminals(options).slice(0, shape.slots).sort((a, b) => a - b);
      return {
        answer,
        prompt: {
          kind: PuzzleKind.SELECT,
          slots: shape.slots,
          options,
          duration: shape.duration,
          minimumSeconds,
        },
      };
    }
  }
}

function uniqueValues(count: number): number[] {
  const seen = new Set<number>();
  while (seen.size < count) seen.add(randomInt(10, 99));
  return [...seen];
}

/* ------------------------------------------------------ verification - */

export const TaskError = {
  NOT_ASSIGNED: 'NOT_ASSIGNED',
  ALREADY_COMPLETE: 'ALREADY_COMPLETE',
  OUT_OF_RANGE: 'OUT_OF_RANGE',
  WRONG_PHASE: 'WRONG_PHASE',
  DEAD: 'DEAD',
  NOT_OPERATOR: 'NOT_OPERATOR',
  NO_PUZZLE: 'NO_PUZZLE',
  WRONG_STEP: 'WRONG_STEP',
  WRONG_ANSWER: 'WRONG_ANSWER',
  TOO_FAST: 'TOO_FAST',
} as const;
export type TaskError = (typeof TaskError)[keyof typeof TaskError];

function puzzleKey(playerId: string, taskId: string, step: number): string {
  return `${playerId}:${taskId}:${step}`;
}

/** Checks a player may work a task right now, and returns it. */
export function openTask(
  match: Match,
  player: MatchPlayer,
  taskId: string,
): { ok: true; puzzle: TaskPuzzle } | { ok: false; error: TaskError } {
  if (!player.alive) return { ok: false, error: TaskError.DEAD };
  if (match.phase !== 'PLAYING' && match.phase !== 'SABOTAGE') {
    return { ok: false, error: TaskError.WRONG_PHASE };
  }

  /*
   * A Saboteur reaching this point is *expected*: faking work at a terminal is
   * how they blend in. They are refused here rather than at the door, because
   * being visibly unable to approach a terminal would identify them instantly.
   */
  if (player.role !== PlayerRole.OPERATOR) return { ok: false, error: TaskError.NOT_OPERATOR };

  const task = player.tasks.find((candidate) => candidate.id === taskId);
  if (!task) return { ok: false, error: TaskError.NOT_ASSIGNED };
  if (task.status === TaskStatus.COMPLETE) return { ok: false, error: TaskError.ALREADY_COMPLETE };

  const terminal = match.map.terminals.find((candidate) => candidate.id === task.terminalId);
  if (!terminal) return { ok: false, error: TaskError.NOT_ASSIGNED };

  if (distanceBetween(player.position, terminal.position) > INTERACT_RANGE) {
    return { ok: false, error: TaskError.OUT_OF_RANGE };
  }

  const { prompt, answer } = generatePuzzle(task);

  // Stored server-side. The answer never appears in the returned puzzle.
  const pending: PendingPuzzle = {
    taskId: task.id,
    playerId: player.userId,
    step: task.progress,
    answer,
    issuedAt: Date.now(),
    minimumMs: minimumMsFor(prompt.slots),
  };
  match.puzzles.set(puzzleKey(player.userId, task.id, task.progress), pending);

  task.status = TaskStatus.IN_PROGRESS;

  return {
    ok: true,
    puzzle: {
      taskId: task.id,
      type: task.type,
      step: task.progress,
      steps: task.steps,
      prompt,
    },
  };
}

export interface StepResult {
  task: TaskAssignment;
  /** True when this step finished the whole objective. */
  completed: boolean;
  /** The next step's puzzle, or null when the objective is done. */
  next: TaskPuzzle | null;
}

/**
 * Verifies one submitted step.
 *
 * Every check here is against server-held state: the assignment, the position,
 * the stored answer and the issue time. Nothing the client sent is believed
 * except the values themselves, which are what is being checked.
 */
export function submitStep(
  match: Match,
  player: MatchPlayer,
  taskId: string,
  step: number,
  values: number[],
  now = Date.now(),
): { ok: true; result: StepResult } | { ok: false; error: TaskError } {
  if (!player.alive) return { ok: false, error: TaskError.DEAD };
  if (match.phase !== 'PLAYING' && match.phase !== 'SABOTAGE') {
    return { ok: false, error: TaskError.WRONG_PHASE };
  }
  if (player.role !== PlayerRole.OPERATOR) return { ok: false, error: TaskError.NOT_OPERATOR };

  const task = player.tasks.find((candidate) => candidate.id === taskId);
  if (!task) return { ok: false, error: TaskError.NOT_ASSIGNED };
  if (task.status === TaskStatus.COMPLETE) return { ok: false, error: TaskError.ALREADY_COMPLETE };
  if (step !== task.progress) return { ok: false, error: TaskError.WRONG_STEP };

  const key = puzzleKey(player.userId, taskId, step);
  const pending = match.puzzles.get(key);
  if (!pending) return { ok: false, error: TaskError.NO_PUZZLE };

  // Range is re-checked at submission, not only at open. Otherwise a player
  // could open a terminal and walk away while solving it.
  const terminal = match.map.terminals.find((candidate) => candidate.id === task.terminalId);
  if (!terminal || distanceBetween(player.position, terminal.position) > INTERACT_RANGE) {
    return { ok: false, error: TaskError.OUT_OF_RANGE };
  }

  // Measured against the server's own issue time, not the client's claim.
  if (now - pending.issuedAt < pending.minimumMs) {
    return { ok: false, error: TaskError.TOO_FAST };
  }

  if (!answersMatch(pending.answer, values)) {
    return { ok: false, error: TaskError.WRONG_ANSWER };
  }

  match.puzzles.delete(key);

  task.progress += 1;
  match.taskCompleted += 1;
  player.objectivesCompleted += 1;

  if (task.progress >= task.steps) {
    task.status = TaskStatus.COMPLETE;
    return { ok: true, result: { task, completed: true, next: null } };
  }

  const { prompt, answer } = generatePuzzle(task);
  match.puzzles.set(puzzleKey(player.userId, taskId, task.progress), {
    taskId,
    playerId: player.userId,
    step: task.progress,
    answer,
    issuedAt: now,
    minimumMs: minimumMsFor(prompt.slots),
  });

  return {
    ok: true,
    result: {
      task,
      completed: false,
      next: { taskId, type: task.type, step: task.progress, steps: task.steps, prompt },
    },
  };
}

function answersMatch(expected: readonly number[], actual: readonly number[]): boolean {
  if (!Array.isArray(actual) || actual.length !== expected.length) return false;
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) return false;
  }
  return true;
}

/**
 * The team objective bar.
 *
 * The only task information a Saboteur receives - it is their clock. It carries
 * no hint of *who* completed what, which would otherwise tell a Saboteur which
 * players are definitely Operators.
 */
export function teamProgress(match: Match): TeamTaskProgress {
  const total = Math.max(0, match.taskTotal);
  const completed = Math.min(match.taskCompleted, total);

  return {
    completed,
    total,
    ratio: total === 0 ? 0 : completed / total,
  };
}

/** True when every assigned objective has been completed. */
export function allTasksComplete(match: Match): boolean {
  return match.taskTotal > 0 && match.taskCompleted >= match.taskTotal;
}

/** Terminals on a map, for tests and diagnostics. */
export function terminalCount(map: MapData): number {
  return map.terminals.length;
}
