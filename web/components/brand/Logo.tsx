import { cn } from '@/lib/cn';

/**
 * The VOIDLINE mark.
 *
 * An orbital ring, cut across by a single horizontal line - and two ears on
 * top of it, with two slit eyes watching from the dark side of the line.
 *
 * The idea the whole game rests on, in one shape: this looks like a station
 * from a distance and like a cat the moment you notice the ears. Nobody sees
 * both at once the first time, which is the point.
 *
 * Drawn with `currentColor` and no gradients, so the same path is legible as a
 * 16px browser tab icon and as a 200px splash mark, and inherits whatever
 * colour its context sets. The one optional flourish is `eyes`, which tints
 * the two slits gold - used on the splash and the role reveal, never at
 * favicon size where two gold pixels are just noise.
 */
export function LogoMark({
  className,
  eyes = false,
}: {
  className?: string;
  /** Tints the eyes. For large marks only. */
  eyes?: boolean;
}) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden className={cn('size-8', className)}>
      {/* Ears. Drawn first so the ring's stroke sits over their base. */}
      <path d="M13.5 12.5 9 2.5l11.5 5.5Z" fill="currentColor" />
      <path d="M34.5 12.5 39 2.5 27.5 8Z" fill="currentColor" />

      {/*
       * The orbital ring, opened at the sides where the line passes through.
       * Four arcs rather than a circle with a mask: fewer nodes, and it scales
       * without the mask edge going soft.
       */}
      <path
        d="M24 7a17 17 0 0 1 16.3 12.2M40.3 28.8A17 17 0 0 1 24 41 17 17 0 0 1 7.7 28.8M7.7 19.2A17 17 0 0 1 24 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.55"
      />

      {/* The void line. */}
      <path d="M2 24h44" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />

      {/*
       * The eyes sit on the line rather than beside it. Each is punched out of
       * the line by a backing plate in the page colour, so the line appears to
       * pass behind them instead of through them.
       */}
      <g className="fill-void-950">
        <ellipse cx="17.5" cy="24" rx="4.2" ry="6.4" />
        <ellipse cx="30.5" cy="24" rx="4.2" ry="6.4" />
      </g>
      <g fill={eyes ? 'var(--color-cat-eye)' : 'currentColor'}>
        <ellipse cx="17.5" cy="24" rx="2.1" ry="4.8" />
        <ellipse cx="30.5" cy="24" rx="2.1" ry="4.8" />
      </g>
    </svg>
  );
}

/**
 * The wordmark lockup.
 *
 * Three forms, which is what a game needs and no more:
 *
 *   default   mark + VOIDLINE, side by side. Headers, lobby, nav.
 *   compact   a smaller mark and tighter type, for dense bars.
 *   stacked   mark above the word, centred. Splash and sign-in.
 */
export function Logo({
  className,
  stacked = false,
  compact = false,
  showTagline = false,
  eyes = false,
}: {
  className?: string;
  stacked?: boolean;
  compact?: boolean;
  showTagline?: boolean;
  eyes?: boolean;
}) {
  return (
    <div
      className={cn('flex items-center gap-3', stacked && 'flex-col gap-4 text-center', className)}
    >
      <LogoMark
        eyes={eyes || stacked}
        className={cn(
          'text-signal',
          stacked ? 'size-16 sm:size-20' : compact ? 'size-6' : 'size-8',
        )}
      />
      <div className={cn(stacked && 'flex flex-col items-center')}>
        <span
          className={cn(
            'block font-display font-bold tracking-[0.2em] text-ink',
            stacked ? 'text-3xl sm:text-4xl' : compact ? 'text-sm tracking-[0.15em]' : 'text-lg',
          )}
        >
          VOIDLINE
        </span>
        {showTagline ? (
          <span className="mt-2 block text-xs tracking-[0.3em] text-ink-faint uppercase sm:text-sm">
            One of you is not crew
          </span>
        ) : null}
      </div>
    </div>
  );
}
