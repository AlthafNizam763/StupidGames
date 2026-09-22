import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone = 'neutral' | 'signal' | 'alert' | 'caution' | 'beacon';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-void-800 text-ink-muted border-void-600',
  signal: 'bg-signal-glow text-signal border-signal/30',
  alert: 'bg-alert-glow text-alert border-alert/30',
  caution: 'bg-caution/10 text-caution border-caution/30',
  beacon: 'bg-beacon/10 text-beacon border-beacon/30',
};

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

/**
 * A small status pill.
 *
 * Badges always carry a text label, never colour alone. A player with a colour
 * vision deficiency has to be able to tell "Ready" from "Not ready" and
 * "Connected" from "Reconnecting" (§46).
 */
export function Badge({ tone = 'neutral', children, icon, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
        'text-xs font-medium tracking-wide whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {icon ? (
        <span aria-hidden className="shrink-0">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}

/** A small pulsing dot, for live status next to a label. */
export function StatusDot({ tone = 'signal', pulse = false }: { tone?: BadgeTone; pulse?: boolean }) {
  const colour: Record<BadgeTone, string> = {
    neutral: 'bg-ink-faint',
    signal: 'bg-signal',
    alert: 'bg-alert',
    caution: 'bg-caution',
    beacon: 'bg-beacon',
  };
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2 shrink-0 rounded-full', colour[tone], pulse && 'animate-pulse-soft')}
    />
  );
}
