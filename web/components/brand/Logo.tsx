import { cn } from '@/lib/cn';

/**
 * The VOIDLINE mark: an orbital ring cut by a single horizontal line, with the
 * station sitting on the cut.
 *
 * Drawn with `currentColor` and no gradients so it stays legible at 16px in a
 * browser tab and at 200px on the splash screen, and inherits whatever colour
 * its context sets.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
      className={cn('size-8', className)}
    >
      {/* Orbital ring, opened at the sides where the line passes through. */}
      <path
        d="M24 5a19 19 0 0 1 18.2 13.6M42.2 29.4A19 19 0 0 1 24 43 19 19 0 0 1 5.8 29.4M5.8 18.6A19 19 0 0 1 24 5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* The void line. */}
      <path d="M2 24h44" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      {/* The station. */}
      <circle cx="24" cy="24" r="5.5" fill="currentColor" />
      <circle cx="24" cy="24" r="2" className="fill-void-950" />
    </svg>
  );
}

/** Mark plus wordmark. `stacked` is for the splash screen. */
export function Logo({
  className,
  stacked = false,
  showTagline = false,
}: {
  className?: string;
  stacked?: boolean;
  showTagline?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3',
        stacked && 'flex-col gap-4 text-center',
        className,
      )}
    >
      <LogoMark className={cn('text-signal', stacked ? 'size-16 sm:size-20' : 'size-8')} />
      <div className={cn(stacked && 'flex flex-col items-center')}>
        <span
          className={cn(
            'block font-display font-bold tracking-[0.2em] text-ink',
            stacked ? 'text-3xl sm:text-4xl' : 'text-lg',
          )}
        >
          VOIDLINE
        </span>
        {showTagline ? (
          <span className="mt-2 block text-xs tracking-[0.3em] text-ink-faint uppercase sm:text-sm">
            Orbital Facility 09
          </span>
        ) : null}
      </div>
    </div>
  );
}
