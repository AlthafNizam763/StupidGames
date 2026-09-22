import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Button } from './Button';
import { Spinner } from './Spinner';

/**
 * Loading, empty and error states (§45).
 *
 * These live in one component because they occupy the same slot and should look
 * like siblings. Having one place to render them is also what stops a screen
 * from quietly shipping with a blank div where its empty state should be.
 */

export function LoadingState({
  label = 'Loading',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 px-4 py-12 text-center', className)}
    >
      <Spinner size="lg" label={null} className="text-signal" />
      <p aria-live="polite" className="text-sm text-ink-muted">
        {label}
      </p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-3 px-4 py-12 text-center', className)}
    >
      {icon ? (
        <div aria-hidden className="text-ink-faint">
          {icon}
        </div>
      ) : null}
      <div className="max-w-sm">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {description ? <p className="mt-1.5 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  retryLabel = 'Try again',
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center justify-center gap-3 px-4 py-12 text-center', className)}
    >
      <span
        aria-hidden
        className="grid size-11 place-items-center rounded-full border border-alert/30 bg-alert-glow text-lg font-bold text-alert"
      >
        !
      </span>
      <div className="max-w-sm">
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {description ? <p className="mt-1.5 text-sm text-ink-muted">{description}</p> : null}
      </div>
      {/* Every error state offers a way forward, never just a dead end. */}
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      ) : null}
    </div>
  );
}

/** Placeholder block for content that is still loading but has a known shape. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('block overflow-hidden rounded-lg bg-void-800', className)}
    >
      <span className="block h-full w-1/3 animate-[voidline-sweep_1.6s_linear_infinite] bg-linear-to-r from-transparent via-void-700 to-transparent" />
    </span>
  );
}
