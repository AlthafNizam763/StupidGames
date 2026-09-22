import { LogoMark } from '@/components/brand/Logo';

/**
 * Route-level loading state.
 *
 * Shown by the App Router while a segment streams in. It is the brand mark
 * rather than a bare spinner, so a slow connection sees VOIDLINE instead of an
 * anonymous loading screen.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-screen-safe flex flex-col items-center justify-center gap-4"
    >
      <LogoMark className="size-12 animate-pulse-soft text-signal" />
      <span className="sr-only">Loading</span>
      <span aria-hidden className="text-xs tracking-[0.3em] text-ink-faint uppercase">
        Connecting
      </span>
    </div>
  );
}
