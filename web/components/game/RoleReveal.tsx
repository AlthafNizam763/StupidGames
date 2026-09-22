'use client';

import { useEffect, useState } from 'react';
import { PlayerRole, type CharacterAppearance } from '@voidline/shared';
import { Button } from '@/components/ui';
import { CatCharacter, CatSilhouette, HumanCharacter } from '@/components/character';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { roleIdentity } from '@/lib/fiction';
import { cn } from '@/lib/cn';

/**
 * The role reveal.
 *
 * The most important screen in the game, and the only one whose entire job is
 * to make a player feel something for three seconds.
 *
 * WHAT IT IS TOLD, AND BY WHOM. The `role` prop comes from `GameSelfState`,
 * which the server sends to one socket - its owner's. There is no other path
 * by which a client could know this, and no broadcast payload carries it. So
 * this component cannot leak a role it was never given, and the secrecy does
 * not depend on anybody remembering not to render it (§BG).
 *
 * The Cat sequence:
 *
 *      the crew member you have been looking at all lobby
 *                          ↓
 *                a shadow passes over them
 *                          ↓
 *          they fall to silhouette, and the eyes catch
 *                          ↓
 *            the silhouette is not a person's any more
 *                          ↓
 *                       THE CAT
 *
 * Deliberately short, deliberately skippable, and it does not permanently
 * change the player's character - the moment it finishes, they are the same
 * crew member everybody else sees. The transformation is a piece of theatre
 * shown to one person (§4).
 *
 * The Operator sequence is the same shape with the middle removed: they are
 * what they appear to be, and the screen should say so quickly and let them
 * get on with it.
 */

/** How long each beat holds, in ms. The whole Cat sequence is under three seconds. */
const BEATS = {
  human: 700,
  shadow: 800,
  silhouette: 900,
} as const;

type Stage = 'HUMAN' | 'SHADOW' | 'SILHOUETTE' | 'REVEALED';

export interface RoleRevealProps {
  /** From `GameSelfState.self.role`. This socket's own role and nobody else's. */
  role: PlayerRole;
  username: string;
  avatarId: string;
  appearance: CharacterAppearance;
  /** Called when the player dismisses, or when the sequence finishes. */
  onDismiss?: () => void;
  /** Seconds until the match starts anyway. Omitted, no countdown is shown. */
  secondsUntilStart?: number | null;
}

export function RoleReveal({
  role,
  username,
  avatarId,
  appearance,
  onDismiss,
  secondsUntilStart = null,
}: RoleRevealProps) {
  const isCat = role === PlayerRole.SABOTEUR;
  const identity = roleIdentity(role);
  const reducedMotion = useReducedMotion();

  const [stage, setStage] = useState<Stage>(reducedMotion ? 'REVEALED' : 'HUMAN');

  useEffect(() => {
    /*
     * A player who asked for reduced motion gets the answer immediately.
     * Skipping the animation but keeping the three-second wait would honour
     * the letter of the setting and none of the point of it.
     */
    if (reducedMotion) {
      setStage('REVEALED');
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (delay: number, next: Stage) => timers.push(setTimeout(() => setStage(next), delay));

    if (isCat) {
      at(BEATS.human, 'SHADOW');
      at(BEATS.human + BEATS.shadow, 'SILHOUETTE');
      at(BEATS.human + BEATS.shadow + BEATS.silhouette, 'REVEALED');
    } else {
      // Operators get the shadow too, so that a player watching their own
      // screen cannot tell their role from how long the animation runs.
      at(BEATS.human, 'SHADOW');
      at(BEATS.human + BEATS.shadow, 'REVEALED');
    }

    return () => timers.forEach(clearTimeout);
  }, [isCat, reducedMotion]);

  const revealed = stage === 'REVEALED';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={revealed ? `Your role: ${identity.name}` : 'Assigning your role'}
      className={cn(
        'fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden px-safe py-8',
        // The backdrop only turns violet once the Cat is out. Before that,
        // both roles look identical - including to somebody glancing over a
        // shoulder (§AO).
        revealed && isCat ? 'cat-backdrop' : 'station-backdrop',
      )}
    >
      {/* ------------------------------------------------------- stage - */}

      <div className="relative grid h-64 w-64 place-items-center sm:h-80 sm:w-80">
        <Figure
          stage={stage}
          isCat={isCat}
          username={username}
          avatarId={avatarId}
          appearance={appearance}
        />

        {/*
         * The shadow that passes over the character. One sweeping band, not a
         * full-screen flash: a white frame is unpleasant on an OLED phone at
         * night and is a real problem for photosensitive players.
         */}
        {stage === 'SHADOW' ? (
          <span
            aria-hidden
            className="animate-shadow-pass pointer-events-none absolute inset-y-0 -left-1/2 w-1/2
                       bg-gradient-to-r from-transparent via-void-950 to-transparent"
          />
        ) : null}
      </div>

      {/* -------------------------------------------------------- copy - */}

      {/*
       * `w-full` on both, or the inner block sizes to its content and the
       * note below pushes past the right edge of a 430px phone. Horizontal
       * overflow is a hard failure for this project (§BJ), and a centred
       * flex column does not constrain its children on its own.
       */}
      <div className="mt-8 flex w-full max-w-sm flex-col items-center text-center">
        {revealed ? (
          <div className="animate-pop w-full">
            <p
              className={cn(
                'font-mono text-xs tracking-[0.35em] uppercase',
                isCat ? 'text-cat' : 'text-ink-faint',
              )}
            >
              {isCat ? 'Your secret' : 'Your role'}
            </p>

            <h1
              className={cn(
                'mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl',
                isCat ? 'text-cat' : 'text-signal',
              )}
            >
              {identity.display}
            </h1>

            <p className="mt-4 text-[0.9375rem] text-ink">{identity.premise}</p>

            <ul className="mt-5 flex flex-col gap-2 text-sm text-ink-muted">
              {identity.objectives.map((objective) => (
                <li key={objective} className="flex items-start gap-2.5 text-left">
                  <span
                    aria-hidden
                    className={cn(
                      'mt-1.5 size-1.5 shrink-0 rounded-full',
                      isCat ? 'bg-cat' : 'bg-signal',
                    )}
                  />
                  {objective}
                </li>
              ))}
            </ul>

            {/*
             * Said plainly, because it is the rule a new player most often
             * gets wrong: being the Cat changes nothing about how you look.
             */}
            {isCat ? (
              <p className="mt-5 rounded-xl border border-cat/25 bg-cat-glow px-4 py-3 text-sm text-ink-muted">
                Everyone still sees {username} — the same crew member they saw in the lobby.
                Nothing about you looks different.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="font-mono text-xs tracking-[0.35em] text-ink-faint uppercase">
            Assigning roles
          </p>
        )}
      </div>

      {/* ------------------------------------------------------ dismiss - */}

      <div className="mt-8 flex flex-col items-center gap-3">
        <Button
          variant={revealed ? (isCat ? 'secondary' : 'primary') : 'ghost'}
          size="lg"
          onClick={onDismiss}
          className={cn(
            revealed && isCat && 'border-cat/40 text-cat hover:border-cat hover:bg-cat-glow',
          )}
        >
          {revealed ? 'Understood' : 'Skip'}
        </Button>

        {secondsUntilStart !== null ? (
          <p className="font-mono text-xs text-ink-faint tabular-nums">
            Match begins in {Math.max(0, secondsUntilStart)}s
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- figure - */

/**
 * What is standing on the stage at each beat.
 *
 * The human and the Cat share one 100x140 frame and stand on the same ground
 * line, which is what lets the swap read as a transformation rather than as
 * one image being replaced by a different-sized one.
 */
function Figure({
  stage,
  isCat,
  username,
  avatarId,
  appearance,
}: {
  stage: Stage;
  isCat: boolean;
  username: string;
  avatarId: string;
  appearance: CharacterAppearance;
}) {
  if (isCat && stage === 'SILHOUETTE') {
    return (
      <div className="relative grid size-full place-items-center">
        <CatSilhouette className="size-56 text-void-900 sm:size-64" />
        {/* The eyes catch the light a beat before the rest of it arrives. */}
        <span
          aria-hidden
          className="animate-eye-glow absolute top-[38%] flex gap-6"
          style={{ color: 'var(--color-cat-eye)' }}
        >
          <span className="block size-3 rounded-full bg-cat-eye shadow-[0_0_18px_6px_var(--color-cat-eye)]" />
          <span className="block size-3 rounded-full bg-cat-eye shadow-[0_0_18px_6px_var(--color-cat-eye)]" />
        </span>
      </div>
    );
  }

  if (isCat && stage === 'REVEALED') {
    return (
      <CatCharacter
        expression="SMIRK"
        animated
        name="The Cat"
        className="animate-pop size-56 sm:size-64"
      />
    );
  }

  return (
    <HumanCharacter
      appearance={appearance}
      avatarId={avatarId}
      expression={stage === 'REVEALED' ? 'HAPPY' : 'NORMAL'}
      animated
      name={username}
      className="size-56 sm:size-64"
    />
  );
}
