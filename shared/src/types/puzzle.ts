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
 * Honest about what this cannot do. A puzzle a person can solve from the prompt
 * is a puzzle a script can solve from the prompt: whatever rule the player
 * applies, a modified client can apply faster. That is not a flaw in these
 * puzzles, it is what a puzzle is. The defences are a minimum plausible solve
 * time, the action rate limiter, and the fact that the server generates the
 * answer and verifies it - so a client can cheat at the *speed* of an
 * objective, never at whether it was actually completed.
 *
 * This corrects an earlier claim, recorded here because the claim caused a bug.
 * SELECT was described as unforgeable because its answer never left the server.
 * The answer was a random subset with nothing in the prompt identifying it, so
 * the puzzle was not unforgeable - it was unsolvable, a 1-in-495 guess for an
 * honest player and exactly the same guess for a script. Secrecy of the answer
 * buys nothing unless the answer is derivable, and once it is derivable the
 * secrecy buys nothing either.
 */

export const PuzzleKind = {
  /** Match the shown targets. Public answer; the challenge is doing it. */
  ALIGN: 'ALIGN',
  /** Choose every option at or above `reference`. */
  SELECT: 'SELECT',
  /** Put the shown values in the correct order. */
  ORDER: 'ORDER',
} as const;
export type PuzzleKind = (typeof PuzzleKind)[keyof typeof PuzzleKind];

/**
 * The public half of a puzzle.
 *
 * Everything the player needs to reach the answer, and nothing else. Every kind
 * must be solvable from this alone - if it is not, the puzzle is broken however
 * correctly the server verifies it.
 */
export interface PuzzlePrompt {
  kind: PuzzleKind;
  /** How many values a solution must contain. */
  slots: number;
  /** Values the player can choose from, for SELECT and ORDER. */
  options: number[];
  /** What to match, for ALIGN. Absent for the other kinds. */
  targets?: number[];
  /**
   * The threshold, for SELECT: every option at or above it is part of the
   * answer, and exactly `slots` of them are.
   *
   * The rule lives here rather than only in the client's copy so that the
   * statement the player reads and the condition the server verifies cannot
   * drift apart.
   */
  reference?: number;
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
