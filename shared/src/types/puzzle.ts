import type { TaskId, TaskType } from './task';

/**
 * Objective mini-games, as a protocol.
 *
 * Seven different puzzles (§18) share one wire shape rather than seven. The
 * server generates a puzzle, sends the *public* part, and keeps the answer. The
 * client renders that public part however the puzzle's design calls for, and
 * sends back a list of values. Verification compares them to the stored answer.
 *
 * One shape means adding an eighth puzzle is a server change and a rendering
 * change, not a protocol change - and it means the verification path is written
 * once and cannot be got wrong differently seven times.
 *
 * Honest about what this cannot do: for a *dexterity* puzzle - align these
 * dials, press on the beat - the target is necessarily public, so a determined
 * player with a modified client can submit a correct answer instantly. The
 * defences are a minimum plausible solve time and the action rate limiter, the
 * same as for any action game. For a *knowledge* puzzle - match the hidden
 * pattern - the answer never leaves the server and cannot be forged at all.
 */

export const PuzzleKind = {
  /** Match the shown targets. Public answer; the challenge is doing it. */
  ALIGN: 'ALIGN',
  /** Choose the right options. The answer is held server-side. */
  SELECT: 'SELECT',
  /** Put the shown values in the correct order. */
  ORDER: 'ORDER',
} as const;
export type PuzzleKind = (typeof PuzzleKind)[keyof typeof PuzzleKind];

/**
 * The public half of a puzzle.
 *
 * Contains nothing the server needs to keep secret for a SELECT puzzle. For
 * ALIGN and ORDER the targets are the puzzle, so they are here by necessity.
 */
export interface PuzzlePrompt {
  kind: PuzzleKind;
  /** How many values a solution must contain. */
  slots: number;
  /** Values the player can choose from, for SELECT and ORDER. */
  options: number[];
  /** What to match, for ALIGN. Absent when the answer is secret. */
  targets?: number[];
  /** Seconds this step is expected to take. A UI hint, never a rule. */
  duration: number;
  /**
   * Minimum seconds the server will accept.
   *
   * Sent so a well-behaved client can disable its own submit button rather
   * than having a legitimate fast solve rejected. The server enforces it
   * regardless of whether the client honoured it.
   */
  minimumSeconds: number;
}

export interface TaskPuzzle {
  taskId: TaskId;
  type: TaskType;
  /** Zero-based. A multi-step objective issues one puzzle per step. */
  step: number;
  steps: number;
  prompt: PuzzlePrompt;
}

/** What the client sends back. */
export interface PuzzleSolution {
  taskId: TaskId;
  step: number;
  values: number[];
  /** Client-measured solve time. Sanity-checked, never trusted on its own. */
  elapsedMs: number;
}
