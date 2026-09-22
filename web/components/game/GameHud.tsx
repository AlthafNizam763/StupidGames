'use client';

import { useEffect, useState } from 'react';
import {
  GamePhase,
  PlayerRole,
  SabotageType,
  type GameSelfState,
  type GameSnapshot,
} from '@voidline/shared';
import { cn } from '@/lib/cn';
import { PhaseTimer } from './PhaseTimer';

/**
 * The in-match heads-up display (§K, §AS).
 *
 * Two layouts, not one scaled down (§K is explicit about this). On a phone
 * the status rail is a thin strip along the top and every control is a
 * thumb-sized button pinned to the bottom corners, because the middle of a
 * phone screen is where the game is and the edges are where the hands are. On
 * a desktop the same information spreads into the corners and the actions sit
 * bottom-right near the pointer.
 *
 * THE CAT'S CONTROLS (§M, §AO). Eliminate and Sabotage render only when
 * `self.role` says so, and `self` comes from `GameSelfState` - a payload the
 * server sends to one socket. An Operator's client is never told there is
 * anything to hide, so there is no conditional here that a modified client
 * could flip: the data simply is not there.
 *
 * They are also deliberately understated. A glowing red ELIMINATE panel is a
 * confession to anyone glancing at your screen in the same room, so the Cat's
 * controls are the same size and weight as everybody else's, distinguished by
 * label and a violet edge rather than by drama.
 */

export interface GameHudProps {
  snapshot: GameSnapshot;
  self: GameSelfState;
  /** Nearest living player, for elimination. Null when there is nobody. */
  nearestPlayerId: string | null;
  /** Nearest unreported body, for reporting. */
  nearestBodyId: string | null;
  /** The objective terminal in range, if any. */
  interactableTaskId: string | null;
  onInteract: (taskId: string) => void;
  onEliminate: (targetId: string) => void;
  onReport: (bodyId: string) => void;
  onEmergency: () => void;
  onSabotage: (type: SabotageType) => void;
  onOpenMenu: () => void;
  busy?: boolean;
}

export function GameHud({
  snapshot,
  self,
  nearestPlayerId,
  nearestBodyId,
  interactableTaskId,
  onInteract,
  onEliminate,
  onReport,
  onEmergency,
  onSabotage,
  onOpenMenu,
  busy = false,
}: GameHudProps) {
  const isCat = self.self.role === PlayerRole.SABOTEUR;
  const alive = self.self.alive;
  const [sabotageOpen, setSabotageOpen] = useState(false);

  const killReady = useCooldownPassed(self.self.killCooldownEndsAt);
  const sabotageReady = useCooldownPassed(self.self.sabotageCooldownEndsAt);

  const done = self.tasks.filter((task) => task.status === 'COMPLETE').length;

  return (
    <>
      {/* ==================================================== status rail = */}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start gap-2 p-2 pt-safe sm:p-3">
        {/* Objectives. The team bar is the only task information the Cat gets. */}
        <div className="pointer-events-auto min-w-0 flex-1 rounded-xl border border-void-700 bg-void-900/90 px-3 py-2 backdrop-blur">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-mono text-[0.625rem] tracking-[0.2em] text-ink-faint uppercase">
              Objectives
            </span>
            <span className="font-mono text-xs text-ink tabular-nums">
              {Math.round(snapshot.tasks.ratio * 100)}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-void-800">
            <div
              className="h-full rounded-full bg-signal transition-[width] duration-500 ease-[var(--ease-out-soft)]"
              style={{ width: `${snapshot.tasks.ratio * 100}%` }}
            />
          </div>
          {/* Your own count, which only you have. Operators only - the Cat has
              no objectives, and showing "0 of 0" would be a tell on a shared
              screen. */}
          {!isCat && self.tasks.length > 0 ? (
            <p className="mt-1 font-mono text-[0.625rem] text-ink-faint tabular-nums">
              yours {done}/{self.tasks.length}
            </p>
          ) : null}
        </div>

        <PhaseTimer timer={snapshot.timer} className="pointer-events-auto" />

        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Menu"
          className="pointer-events-auto touch-target grid shrink-0 place-items-center rounded-xl
                     border border-void-700 bg-void-900/90 text-ink-muted backdrop-blur
                     hover:text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-5">
            <path
              d="M4 6h16M4 12h16M4 18h16"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {/* ==================================================== sabotage bar = */}

      {snapshot.sabotage ? (
        <div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex justify-center px-3">
          <p
            className={cn(
              'animate-pop rounded-full border px-4 py-1.5 text-center text-xs font-medium backdrop-blur',
              snapshot.sabotage.critical
                ? 'border-alert/50 bg-alert-glow text-alert'
                : 'border-caution/40 bg-caution/10 text-caution',
            )}
          >
            {snapshot.sabotage.critical ? 'CRITICAL — ' : ''}
            {snapshot.sabotage.type.replace(/_/g, ' ')}
          </p>
        </div>
      ) : null}

      {/* ====================================================== dead state = */}

      {!alive ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-28 z-20 flex justify-center px-3">
          <p className="rounded-xl border border-void-600 bg-void-900/90 px-4 py-2 text-center text-sm text-ink-muted backdrop-blur">
            You are out. You can still watch, and finish your objectives.
          </p>
        </div>
      ) : null}

      {/* ========================================================= actions = */}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-3 p-3 pb-safe">
        {/*
         * Left is empty on purpose: the joystick lives there on a phone, and
         * putting a control under a thumb that is already busy steering means
         * it gets pressed by accident.
         */}
        <div className="w-32 shrink-0 sm:w-40" aria-hidden />

        <div className="pointer-events-auto flex flex-col items-end gap-2">
          {isCat && alive ? (
            <>
              {sabotageOpen ? (
                <div className="animate-pop flex flex-col items-stretch gap-1.5 rounded-xl border border-cat/30 bg-void-900/95 p-1.5 backdrop-blur">
                  {Object.values(SabotageType).map((type) => (
                    <button
                      key={type}
                      type="button"
                      disabled={busy || !sabotageReady}
                      onClick={() => {
                        setSabotageOpen(false);
                        onSabotage(type);
                      }}
                      className="touch-target rounded-lg px-3 text-left text-xs text-ink-muted
                                 hover:bg-cat-glow hover:text-cat disabled:opacity-40"
                    >
                      {type.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              ) : null}

              <ActionButton
                tone="cat"
                label="Sabotage"
                disabled={busy || !sabotageReady}
                countdownTo={self.self.sabotageCooldownEndsAt}
                onClick={() => setSabotageOpen((open) => !open)}
              />

              <ActionButton
                tone="cat"
                label="Eliminate"
                disabled={busy || !killReady || nearestPlayerId === null}
                countdownTo={self.self.killCooldownEndsAt}
                onClick={() => nearestPlayerId && onEliminate(nearestPlayerId)}
              />
            </>
          ) : null}

          {alive && nearestBodyId ? (
            <ActionButton
              tone="alert"
              label="Report"
              disabled={busy}
              onClick={() => onReport(nearestBodyId)}
            />
          ) : null}

          {alive && snapshot.phase === GamePhase.PLAYING ? (
            <ActionButton
              tone="neutral"
              label="Emergency"
              disabled={busy || self.self.emergencyMeetingsLeft <= 0}
              badge={self.self.emergencyMeetingsLeft > 0 ? self.self.emergencyMeetingsLeft : undefined}
              onClick={onEmergency}
            />
          ) : null}

          <ActionButton
            tone="signal"
            label="Interact"
            large
            disabled={busy || interactableTaskId === null}
            onClick={() => interactableTaskId && onInteract(interactableTaskId)}
          />
        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------- button - */

function ActionButton({
  label,
  tone,
  onClick,
  disabled,
  large = false,
  badge,
  countdownTo,
}: {
  label: string;
  tone: 'signal' | 'alert' | 'cat' | 'neutral';
  onClick: () => void;
  disabled?: boolean;
  large?: boolean;
  badge?: number;
  /** Shows the seconds remaining instead of the label while counting down. */
  countdownTo?: number | null;
}) {
  const remaining = useSecondsRemaining(countdownTo ?? null);

  const tones = {
    signal: 'border-signal/50 bg-signal text-void-950',
    alert: 'border-alert/50 bg-alert text-void-950',
    // The Cat's controls are outlined, not filled. Nothing on this screen
    // should be visible across a room (§AO).
    cat: 'border-cat/45 bg-void-900/95 text-cat',
    neutral: 'border-void-600 bg-void-900/95 text-ink',
  } as const;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative touch-target select-none rounded-2xl border font-semibold backdrop-blur',
        'transition-transform duration-100 active:scale-95',
        'disabled:opacity-40 disabled:active:scale-100',
        large ? 'h-16 min-w-28 px-6 text-base' : 'h-12 min-w-24 px-4 text-sm',
        tones[tone],
      )}
    >
      {remaining !== null && remaining > 0 ? `${remaining}s` : label}
      {badge !== undefined ? (
        <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-void-700 text-[0.625rem] text-ink">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

/* --------------------------------------------------------------- timing - */

/**
 * Seconds left on a server deadline, recomputed once a second.
 *
 * One interval per control rather than a global clock in the store: a store
 * tick would re-render the whole match tree every second for a number that
 * appears on two buttons.
 */
function useSecondsRemaining(endsAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  if (endsAt === null) return null;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

function useCooldownPassed(endsAt: number | null): boolean {
  const remaining = useSecondsRemaining(endsAt);
  return remaining === null || remaining <= 0;
}
