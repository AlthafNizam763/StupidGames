'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ErrorCode,
  PuzzleKind,
  TASK_LABELS,
  type PuzzlePrompt,
  type TaskPuzzle,
} from '@voidline/shared';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { AlignPuzzle, alignComplete } from './AlignPuzzle';
import { SequencePuzzle, sequenceComplete } from './SequencePuzzle';
import { ACCENT_CLASS, TASK_THEME } from './theme';

/**
 * An objective, open (§N, §O).
 *
 * The shell around the three puzzle shapes: heading, instruction, step
 * counter, the puzzle itself, and one button. It owns the interaction state;
 * it owns no rules. The server generated the puzzle, holds the answer, decides
 * whether a submission is correct and decides whether there is another step.
 * This asks and renders the reply.
 *
 * THE SUBMIT BUTTON WAITS. `prompt.minimumSeconds` is the floor below which
 * the server stops believing a submission, and it is sent precisely so a
 * client can hold its own button rather than let a fast player eat a refusal
 * they did nothing to deserve. The wait is shown as a countdown, not hidden
 * behind a disabled button with no explanation.
 *
 * WHAT IT DOES NOT DO: decide whether the answer is right. For ALIGN it could
 * - the targets are on screen - and it still does not, because for SELECT it
 * cannot, and a Submit button that means "correct" on four objectives and
 * "ready" on the other three is a button with two meanings.
 */

type Phase = 'SOLVING' | 'SUBMITTING' | 'REJECTED' | 'COMPLETE';

/** How long the completion tick stays up before the panel closes itself. */
const COMPLETE_HOLD_MS = 900;

export interface TaskPanelProps {
  puzzle: TaskPuzzle;
  /** Resolves with the next step, or null when the objective is finished. */
  onSubmit: (values: number[], elapsedMs: number) => Promise<TaskPuzzle | null>;
  onClose: () => void;
}

export function TaskPanel({ puzzle, onSubmit, onClose }: TaskPanelProps) {
  const theme = TASK_THEME[puzzle.type];
  const accent = ACCENT_CLASS[theme.accent];

  const [values, setValues] = useState<number[]>(() => initialValues(puzzle.prompt));
  const [phase, setPhase] = useState<Phase>('SOLVING');
  const [rejection, setRejection] = useState<string | null>(null);

  /*
   * When the step advances this component is remounted, because the parent
   * keys it on `taskId:step`. So every piece of state here initialises itself
   * for the step it belongs to, and there is no reset effect to forget a
   * field in - which is what React's `key` is for.
   */
  const [openedAt] = useState(() => Date.now());

  const ready = useMinimumElapsed(openedAt, puzzle.prompt.minimumSeconds);

  const filled = useMemo(() => {
    return puzzle.prompt.kind === PuzzleKind.ALIGN
      ? alignComplete(puzzle.prompt, values)
      : sequenceComplete(puzzle.prompt, values);
  }, [puzzle.prompt, values]);

  async function submit() {
    setPhase('SUBMITTING');
    setRejection(null);

    try {
      const next = await onSubmit(values, Date.now() - openedAt);

      if (next === null) {
        setPhase('COMPLETE');
        // Held briefly so the tick is seen, then the panel gets out of the
        // way - §O is explicit that completion must not interrupt play.
        setTimeout(onClose, COMPLETE_HOLD_MS);
      }
      // A non-null next step arrives as a new `puzzle` prop with a new key,
      // which remounts this component fresh. Nothing to do here.
    } catch (error) {
      setPhase('REJECTED');
      setRejection(messageFor(error));
    }
  }

  const stepLabel = puzzle.steps > 1 ? ` — step ${puzzle.step + 1} of ${puzzle.steps}` : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={TASK_LABELS[puzzle.type]}
      className="fixed inset-0 z-40 flex items-end justify-center bg-void-950/80 px-safe pb-safe backdrop-blur-sm sm:items-center sm:p-6"
    >
      <div className="animate-pop flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-void-700 bg-void-900 shadow-lift sm:rounded-2xl">
        {/* ------------------------------------------------------ head - */}

        <header className="flex items-start justify-between gap-3 border-b border-void-700/70 p-4">
          <div className="min-w-0">
            <p className={cn('font-mono text-[0.625rem] tracking-[0.25em] uppercase', accent.text)}>
              Objective{stepLabel}
            </p>
            <h2 className="mt-1 truncate font-display text-lg font-bold text-ink">
              {TASK_LABELS[puzzle.type]}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close objective"
            className="-m-2 grid size-11 shrink-0 place-items-center rounded-lg text-ink-faint hover:text-ink"
          >
            <span aria-hidden className="text-xl leading-none">
              ×
            </span>
          </button>
        </header>

        {/* ------------------------------------------------------ body - */}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {phase === 'COMPLETE' ? (
            <CompleteMark accentText={accent.text} />
          ) : (
            <>
              {/*
               * A puzzle carrying a `reference` states its rule with the real
               * threshold in it. The generic line is the fallback for shapes
               * that have no threshold, not a second way of saying the same
               * thing.
               */}
              <p className="mb-4 text-sm text-ink-muted">
                {puzzle.prompt.reference !== undefined && theme.rule
                  ? theme.rule(puzzle.prompt.reference)
                  : theme.instruction}
              </p>

              {puzzle.prompt.kind === PuzzleKind.ALIGN ? (
                <AlignPuzzle
                  prompt={puzzle.prompt}
                  values={values}
                  onChange={setValues}
                  theme={theme}
                  disabled={phase === 'SUBMITTING'}
                />
              ) : (
                <SequencePuzzle
                  prompt={puzzle.prompt}
                  values={values}
                  onChange={setValues}
                  theme={theme}
                  disabled={phase === 'SUBMITTING'}
                />
              )}

              {rejection ? (
                <p
                  role="alert"
                  className="animate-shake mt-4 rounded-xl border border-alert/40 bg-alert-glow px-3 py-2.5 text-sm text-alert"
                >
                  {rejection}
                </p>
              ) : null}
            </>
          )}
        </div>

        {/* ---------------------------------------------------- footer - */}

        {phase === 'COMPLETE' ? null : (
          <footer className="border-t border-void-700/70 p-4">
            <Button
              fullWidth
              size="lg"
              loading={phase === 'SUBMITTING'}
              disabled={!filled || !ready.passed}
              onClick={() => void submit()}
            >
              {!ready.passed ? `Hold — ${ready.remaining}s` : filled ? 'Submit' : 'Incomplete'}
            </Button>

            {!ready.passed ? (
              <p className="mt-2 text-center text-xs text-ink-faint">
                The station will not accept a reading taken this fast.
              </p>
            ) : null}
          </footer>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- completion - */

function CompleteMark({ accentText }: { accentText: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10">
      <span
        aria-hidden
        className={cn(
          'animate-pop grid size-16 place-items-center rounded-full border-2 border-signal',
          accentText,
        )}
      >
        <svg viewBox="0 0 24 24" fill="none" className="size-8">
          <path
            d="M5 13l4 4L19 7"
            stroke="var(--color-signal)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <p className="font-display text-sm font-bold tracking-[0.2em] text-signal uppercase">
        Objective complete
      </p>
    </div>
  );
}

/* ------------------------------------------------------------ helpers - */

/**
 * Where each puzzle starts.
 *
 * ALIGN sliders start mid-range rather than at zero, so no slider is ever
 * already on its target by accident - a puzzle that begins partly solved
 * reads as broken.
 */
function initialValues(prompt: PuzzlePrompt): number[] {
  if (prompt.kind === PuzzleKind.ALIGN) {
    return Array.from({ length: prompt.slots }, () => 50);
  }
  return [];
}

/** Counts down the server's minimum solve time. */
function useMinimumElapsed(
  openedAt: number,
  minimumSeconds: number,
): { passed: boolean; remaining: number } {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  const elapsed = (now - openedAt) / 1000;
  const remaining = Math.max(0, Math.ceil(minimumSeconds - elapsed));
  return { passed: remaining <= 0, remaining };
}

/**
 * A refusal, in words a player can act on.
 *
 * Walking away from the terminal mid-puzzle is the common one and deserves its
 * own sentence: the generic "something went wrong" would send somebody hunting
 * for a bug that is really just distance.
 */
function messageFor(error: unknown): string {
  const code = (error as { code?: ErrorCode } | null)?.code;

  if (code === ErrorCode.OUT_OF_RANGE) {
    return 'You have moved away from the terminal. Go back to it and try again.';
  }
  if (code === ErrorCode.WRONG_PHASE) {
    return 'The station has called a meeting. This will still be here afterwards.';
  }
  if (code === ErrorCode.RATE_LIMITED) {
    return 'Slow down a moment, then submit again.';
  }

  return error instanceof Error && error.message
    ? error.message
    : 'That reading was refused. Check the panel and try again.';
}
