'use client';

import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  /** Hides the label visually but keeps it for screen readers. */
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: string | null;
  leadingIcon?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

/**
 * A labelled text field.
 *
 * The 16px minimum font size is not a style choice: mobile Safari zooms the
 * whole page when a focused input is smaller than 16px, and the player then has
 * to pinch back out. `text-base` on the control prevents that everywhere.
 */
export function Input({
  label,
  hideLabel = false,
  hint,
  error,
  leadingIcon,
  className,
  id,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  return (
    <div className="w-full">
      <label
        htmlFor={inputId}
        className={cn(
          'mb-1.5 block text-sm font-medium text-ink-muted',
          hideLabel && 'sr-only',
        )}
      >
        {label}
      </label>

      <div className="relative">
        {leadingIcon ? (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint">
            {leadingIcon}
          </span>
        ) : null}

        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={cn(
            'h-12 w-full rounded-xl border bg-void-850 px-3.5 text-base text-ink',
            'placeholder:text-ink-faint',
            'transition-colors duration-150',
            'disabled:cursor-not-allowed disabled:opacity-50',
            leadingIcon && 'pl-10',
            error
              ? 'border-alert focus-visible:outline-alert'
              : 'border-void-600 hover:border-void-500',
            className,
          )}
          {...props}
        />
      </div>

      {/*
       * The error replaces the hint rather than stacking beneath it, so the
       * field never grows by two lines and pushes the submit button off screen
       * on a small viewport.
       */}
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 flex items-start gap-1.5 text-sm text-alert">
          {/* An icon as well as colour: never colour alone (§46). */}
          <span aria-hidden className="mt-px font-semibold">
            !
          </span>
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-sm text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
