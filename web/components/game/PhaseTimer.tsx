'use client';

import { useEffect, useState } from 'react';
import { GamePhase, type PhaseTimer as PhaseTimerPayload } from '@voidline/shared';
import { cn } from '@/lib/cn';

/**
 * The phase clock.
 *
 * Counts down to `endsAt`, which is a server timestamp - so every client
 * agrees, and a client whose own clock is wrong is wrong in the same way
 * throughout rather than drifting against the room.
 *
 * Phases with no deadline (free roam) show the phase name instead of a
 * countdown. A timer that sits at `--:--` invites the question "is it
 * broken", which is worse than not showing one.
 */

const PHASE_LABEL: Partial<Record<GamePhase, string>> = {
  [GamePhase.STARTING]: 'Starting',
  [GamePhase.PLAYING]: 'Live',
  [GamePhase.SABOTAGE]: 'Critical',
  [GamePhase.COUNCIL]: 'Discussion',
  [GamePhase.VOTING]: 'Voting',
  [GamePhase.EJECTION]: 'Airlock',
  [GamePhase.RESULTS]: 'Results',
};

export function PhaseTimer({
  timer,
  className,
}: {
  timer: PhaseTimerPayload;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (timer.endsAt === null) return;
    // Twice a second, so the displayed value never lags the real one by a
    // visible amount without costing a render per frame.
    const interval = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(interval);
  }, [timer.endsAt]);

  const label = PHASE_LABEL[timer.phase] ?? timer.phase;

  if (timer.endsAt === null) {
    return (
      <div
        className={cn(
          'shrink-0 rounded-xl border border-void-700 bg-void-900/90 px-3 py-2 backdrop-blur',
          className,
        )}
      >
        <span className="font-mono text-[0.625rem] tracking-[0.2em] text-ink-faint uppercase">
          {label}
        </span>
      </div>
    );
  }

  const seconds = Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
  const urgent = seconds <= 10;

  return (
    <div
      className={cn(
        'shrink-0 rounded-xl border bg-void-900/90 px-3 py-1.5 text-center backdrop-blur',
        urgent ? 'border-alert/50' : 'border-void-700',
        className,
      )}
      role="timer"
      aria-label={`${label}: ${seconds} seconds remaining`}
    >
      <span className="block font-mono text-[0.625rem] tracking-[0.2em] text-ink-faint uppercase">
        {label}
      </span>
      <span
        className={cn(
          'block font-mono text-lg leading-tight font-bold tabular-nums',
          urgent ? 'text-alert' : 'text-ink',
        )}
      >
        {formatClock(seconds)}
      </span>
    </div>
  );
}

function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${rest.toString().padStart(2, '0')}`;
}
