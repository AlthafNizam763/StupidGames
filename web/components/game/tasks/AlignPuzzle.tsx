'use client';

import type { PuzzlePrompt } from '@voidline/shared';
import { cn } from '@/lib/cn';
import { ACCENT_CLASS, type TaskTheme } from './theme';

/**
 * The slider thumb, in CSS pixels. Must match `size-7` on the thumb below.
 */
const THUMB_PX = 28;

/** The top of the value range the server generates (randomInt(0, 100)). */
const MAX = 99;

/**
 * ALIGN: match every slider to its marked target.
 *
 * The target is public - it is drawn on the track - because for this shape the
 * target *is* the puzzle. The challenge is doing it under time pressure with a
 * thumb, not knowing the answer.
 *
 * Built on `input[type=range]` rather than a custom drag handler. A native
 * range is draggable, tappable, arrow-key operable and announced correctly by
 * a screen reader, all for free; a div with pointer events is none of those
 * and is the usual way a mini-game becomes unplayable for somebody.
 */
export function AlignPuzzle({
  prompt,
  values,
  onChange,
  theme,
  disabled,
}: {
  prompt: PuzzlePrompt;
  values: number[];
  onChange: (next: number[]) => void;
  theme: TaskTheme;
  disabled: boolean;
}) {
  const targets = prompt.targets ?? [];
  const accent = ACCENT_CLASS[theme.accent];

  const set = (index: number, value: number) => {
    const next = [...values];
    next[index] = value;
    onChange(next);
  };

  return (
    <ul className="flex flex-col gap-4">
      {Array.from({ length: prompt.slots }, (_, index) => {
        const target = targets[index] ?? 0;
        const value = values[index] ?? 0;
        const matched = value === target;

        return (
          <li key={index}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <label
                htmlFor={`align-${index}`}
                className="font-mono text-[0.6875rem] tracking-[0.15em] text-ink-faint uppercase"
              >
                {theme.noun} {index + 1}
              </label>
              <span
                className={cn(
                  'font-mono text-sm tabular-nums',
                  matched ? accent.text : 'text-ink-muted',
                )}
              >
                {value}
                {theme.unit} / {target}
                {theme.unit}
              </span>
            </div>

            <div className="relative">
              {/*
               * The target marker sits on the track itself. A legend off to
               * the side would make the player look away from the control
               * they are operating, which at 8 seconds is the whole budget.
               */}
              {/*
               * Positioned to match where the *thumb* lands, not where a raw
               * percentage of the track would fall.
               *
               * A range input's thumb travels between half a thumb-width from
               * each end, so its centre at value v is
               * `half + (track - thumb) * v/max`, not `track * v/max`. Using
               * the naive percentage puts the marker up to half a thumb out -
               * about 14px here - so the slider would read as aligned while
               * the number said otherwise. On a puzzle whose entire content
               * is hitting an exact value, that is the difference between
               * precise and broken.
               */}
              <span
                aria-hidden
                className={cn(
                  'pointer-events-none absolute -top-1 z-10 h-5 w-0.5 -translate-x-1/2 rounded-full',
                  accent.fill,
                )}
                style={{ left: `calc(${THUMB_PX / 2}px + (100% - ${THUMB_PX}px) * ${target / MAX})` }}
              />

              <input
                id={`align-${index}`}
                type="range"
                min={0}
                max={MAX}
                step={1}
                value={value}
                disabled={disabled}
                onChange={(event) => set(index, Number(event.target.value))}
                aria-label={`${theme.noun} ${index + 1}, target ${target}`}
                aria-valuetext={`${value}${theme.unit}, target ${target}${theme.unit}`}
                className={cn(
                  'h-3 w-full cursor-pointer appearance-none rounded-full',
                  'bg-void-800 disabled:cursor-not-allowed disabled:opacity-50',
                  '[&::-webkit-slider-thumb]:size-7 [&::-webkit-slider-thumb]:appearance-none',
                  '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2',
                  '[&::-webkit-slider-thumb]:border-void-950',
                  '[&::-moz-range-thumb]:size-7 [&::-moz-range-thumb]:rounded-full',
                  '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-void-950',
                  // A matched slider turns its own accent, so the player can
                  // see at a glance how many are left without reading numbers.
                  matched
                    ? '[&::-webkit-slider-thumb]:bg-signal [&::-moz-range-thumb]:bg-signal'
                    : '[&::-webkit-slider-thumb]:bg-ink [&::-moz-range-thumb]:bg-ink',
                )}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** True when every slider sits exactly on its target. */
export function alignComplete(prompt: PuzzlePrompt, values: number[]): boolean {
  const targets = prompt.targets ?? [];
  if (values.length !== prompt.slots) return false;
  return targets.every((target, index) => values[index] === target);
}
