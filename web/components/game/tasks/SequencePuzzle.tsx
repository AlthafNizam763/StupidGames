'use client';

import type { PuzzlePrompt } from '@voidline/shared';
import { cn } from '@/lib/cn';
import { ACCENT_CLASS, type TaskTheme } from './theme';

/**
 * ORDER and SELECT: choose values from a pool, in sequence.
 *
 * The two shapes are one interaction. ORDER asks for every option in
 * ascending order; SELECT asks for a subset. Both are "tap things in the pool,
 * they queue up below, tap one in the queue to take it back" - so they share a
 * component rather than duplicating the queue logic twice and letting the two
 * drift.
 *
 * TAP TO SEQUENCE, NOT DRAG TO REORDER. Dragging is the obvious way to build
 * an ordering puzzle and the wrong one here: it is fiddly with a thumb on a
 * moving bus, it fights the page scroll, and it is close to unusable with a
 * keyboard or a screen reader. Tapping is one gesture, works identically on
 * every device, and is faster once you have done it twice.
 */
export function SequencePuzzle({
  prompt,
  values,
  onChange,
  theme,
  disabled,
}: {
  prompt: PuzzlePrompt;
  /** The queue, in the order the player built it. */
  values: number[];
  onChange: (next: number[]) => void;
  theme: TaskTheme;
  disabled: boolean;
}) {
  const accent = ACCENT_CLASS[theme.accent];
  const chosen = new Set(values);
  const full = values.length >= prompt.slots;

  const pick = (value: number) => {
    if (disabled || chosen.has(value) || full) return;
    onChange([...values, value]);
  };

  const unpick = (index: number) => {
    if (disabled) return;
    onChange(values.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ---------------------------------------------------- the queue - */}

      <div>
        <p className="mb-1.5 font-mono text-[0.6875rem] tracking-[0.15em] text-ink-faint uppercase">
          Sequence — {values.length} of {prompt.slots}
        </p>

        <ol
          className={cn(
            'flex min-h-16 flex-wrap items-center gap-2 rounded-xl border border-dashed p-2',
            values.length > 0 ? 'border-void-600 bg-void-900' : 'border-void-700 bg-void-900/50',
          )}
        >
          {values.length === 0 ? (
            <li className="px-2 text-sm text-ink-faint">Nothing selected yet.</li>
          ) : (
            values.map((value, index) => (
              <li key={`${value}-${index}`}>
                <button
                  type="button"
                  onClick={() => unpick(index)}
                  disabled={disabled}
                  aria-label={`Remove ${value} from position ${index + 1}`}
                  className={cn(
                    'touch-target flex items-center gap-1.5 rounded-lg border px-3',
                    'font-mono text-sm tabular-nums transition-colors',
                    accent.border,
                    accent.bg,
                    accent.text,
                  )}
                >
                  <span className="text-[0.625rem] opacity-60">{index + 1}</span>
                  {value}
                </button>
              </li>
            ))
          )}
        </ol>
      </div>

      {/* ----------------------------------------------------- the pool - */}

      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <p className="font-mono text-[0.6875rem] tracking-[0.15em] text-ink-faint uppercase">
            {theme.nounPlural}
          </p>

          {/*
           * The threshold, kept on screen beside the pool.
           *
           * It is in the instruction too, but the instruction is read once and
           * the pool is looked at repeatedly - and the whole task is comparing
           * each number against this one. Deliberately not highlighting which
           * options qualify: that would be solving it for the player.
           */}
          {prompt.reference !== undefined ? (
            <p className={cn('font-mono text-xs tabular-nums', accent.text)}>
              reference {prompt.reference}
            </p>
          ) : null}
        </div>

        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {prompt.options.map((value) => {
            const used = chosen.has(value);
            return (
              <li key={value}>
                <button
                  type="button"
                  onClick={() => pick(value)}
                  disabled={disabled || used || full}
                  aria-pressed={used}
                  className={cn(
                    'touch-target w-full rounded-lg border font-mono text-sm tabular-nums',
                    'transition-colors duration-100 active:scale-95',
                    used
                      ? 'border-void-700 bg-void-900/40 text-ink-faint line-through'
                      : 'border-void-600 bg-void-800 text-ink hover:border-void-500',
                    'disabled:active:scale-100',
                  )}
                >
                  {value}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * Whether the queue is a complete answer.
 *
 * Only length is checked, never correctness - even though both shapes are now
 * checkable here, since ORDER wants ascending and SELECT wants everything at
 * or above `reference`. Refusing to submit until the client believed the
 * answer was right would move the verdict to the client, and the verdict is
 * the server's. The player gets to be wrong and be told so.
 */
export function sequenceComplete(prompt: PuzzlePrompt, values: number[]): boolean {
  return values.length === prompt.slots;
}
