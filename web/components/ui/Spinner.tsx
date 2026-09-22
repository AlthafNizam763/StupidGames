import { cn } from '@/lib/cn';

const SIZES = {
  sm: 'size-4 border-2',
  md: 'size-6 border-2',
  lg: 'size-9 border-[3px]',
} as const;

export interface SpinnerProps {
  size?: keyof typeof SIZES;
  className?: string;
  /** Announced to screen readers. Pass null for a decorative spinner. */
  label?: string | null;
}

/**
 * A ring that leaves one quadrant transparent, so rotation is legible without
 * animating anything expensive. Under `prefers-reduced-motion` the global
 * stylesheet stops the spin; the ring stays visible, so "busy" is still
 * communicated by something other than motion alone (§46).
 */
export function Spinner({ size = 'md', className, label = 'Loading' }: SpinnerProps) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-hidden={label ? undefined : true}
      className={cn('inline-flex shrink-0 items-center justify-center', className)}
    >
      <span
        className={cn(
          'animate-spin rounded-full border-current border-t-transparent opacity-80',
          SIZES[size],
        )}
      />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
