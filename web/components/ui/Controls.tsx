'use client';

import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Form controls for the settings screen.
 *
 * Each is built on the native element that already has the right semantics and
 * keyboard behaviour - `input[type=range]`, `button[role=switch]`,
 * `input[type=radio]` - and styled on top. A div rebuilt to look like a slider
 * is a slider that cannot be operated with arrow keys (§46).
 */

/* ------------------------------------------------------------------ row - */

export function SettingRow({
  label,
  description,
  htmlFor,
  control,
  value,
}: {
  label: string;
  description?: string;
  htmlFor?: string;
  control: ReactNode;
  /** Current value, shown beside the label. */
  value?: string;
}) {
  return (
    <div className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:gap-6 sm:py-4">
      <div className="min-w-0 sm:flex-1">
        <label
          htmlFor={htmlFor}
          className="block text-[0.9375rem] font-medium text-ink"
        >
          {label}
        </label>
        {description ? <p className="mt-0.5 text-sm text-ink-faint">{description}</p> : null}
      </div>

      <div className="flex shrink-0 items-center gap-3 sm:w-64 sm:justify-end">
        {value ? (
          <span className="w-10 shrink-0 text-right font-mono text-sm text-ink-muted tabular-nums">
            {value}
          </span>
        ) : null}
        {control}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- slider - */

export function Slider({
  id,
  label,
  value,
  min = 0,
  max = 1,
  step = 0.05,
  onChange,
  disabled,
}: {
  id: string;
  /** Used for the accessible name when the visible label is elsewhere. */
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const percent = ((value - min) / (max - min)) * 100;

  return (
    <input
      id={id}
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      /*
       * The filled portion is painted with a gradient on the track itself, so
       * there is no second element to keep in sync with the thumb. The thumb
       * is sized generously: a 12px dot is unusable with a thumb on glass.
       */
      style={{
        background: `linear-gradient(to right, var(--color-signal) ${percent}%, var(--color-void-700) ${percent}%)`,
      }}
      className={cn(
        'h-2 w-full min-w-0 cursor-pointer appearance-none rounded-full',
        'disabled:cursor-not-allowed disabled:opacity-50',
        '[&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none',
        '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink',
        '[&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-void-950',
        '[&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full',
        '[&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-void-950',
        '[&::-moz-range-thumb]:bg-ink [&::-moz-range-track]:bg-transparent',
      )}
    />
  );
}

/* --------------------------------------------------------------- toggle - */

export function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      // The hit area is 44px tall even though the track is 28px, so the target
      // meets the minimum without the control looking oversized.
      className="relative inline-flex h-11 w-14 shrink-0 items-center justify-center"
    >
      <span
        className={cn(
          'block h-7 w-12 rounded-full border transition-colors duration-150',
          checked ? 'border-signal bg-signal' : 'border-void-500 bg-void-700',
        )}
      />
      <span
        aria-hidden
        className={cn(
          'absolute size-5 rounded-full bg-void-950 transition-transform duration-150 ease-[var(--ease-out-soft)]',
          // Translation, not a layout change, so the thumb cannot cause reflow.
          checked ? 'translate-x-2.5' : '-translate-x-2.5',
        )}
      />
    </button>
  );
}

/* ---------------------------------------------------------- segmented - */

export function SegmentedControl<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const name = useId();

  return (
    /*
     * A real radio group: arrow keys move between options and a screen reader
     * announces "2 of 2", both of which come free from the native element and
     * would have to be reimplemented on a row of buttons.
     */
    <fieldset className="min-w-0">
      <legend className="sr-only">{legend}</legend>
      <div className="flex rounded-xl border border-void-600 bg-void-850 p-1">
        {options.map((option) => {
          const id = `${name}-${option.value}`;
          const active = option.value === value;
          return (
            <div key={option.value} className="flex-1">
              <input
                id={id}
                type="radio"
                name={name}
                value={option.value}
                checked={active}
                onChange={() => onChange(option.value)}
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                className={cn(
                  'flex h-9 cursor-pointer items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors',
                  'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-signal',
                  active ? 'bg-signal text-void-950' : 'text-ink-muted hover:text-ink',
                )}
              >
                {option.label}
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

/* ---------------------------------------------------------------- group - */

export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-void-700 bg-void-900 p-5 shadow-panel sm:p-6">
      <h2 className="font-display text-xs font-bold tracking-[0.2em] text-ink-faint uppercase">
        {title}
      </h2>
      <div className="mt-2 divide-y divide-void-700/70">{children}</div>
    </section>
  );
}
