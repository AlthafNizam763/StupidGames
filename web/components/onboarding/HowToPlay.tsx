'use client';

import { useState, type ReactNode } from 'react';
import { DEFAULT_APPEARANCE, deriveAppearance } from '@voidline/shared';
import { CatCharacter, CatSilhouette, HumanCharacter } from '@/components/character';
import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';

/**
 * How to play (§BA).
 *
 * Five beats, in the order a new player needs them, and the third one is the
 * whole game:
 *
 *   1. where you are
 *   2. what you are doing
 *   3. one of you is not crew        <- everything before this is setup
 *   4. how you find it
 *   5. what it is like to be it
 *
 * Told with the actual characters rather than illustrations of them, so the
 * figure a player is introduced to on slide one is the figure they will be
 * looking at in the lobby thirty seconds later.
 *
 * Deliberately short and skippable from the first slide. Somebody who has
 * played this kind of game before does not need five screens to work out what
 * it is, and §BB is explicit that an experienced player should not be marched
 * through a tutorial.
 */

interface Slide {
  key: string;
  eyebrow: string;
  title: string;
  body: string;
  art: ReactNode;
  /** The Cat's violet, for the two slides that are about it. */
  cat?: boolean;
}

const CREW = ['operator-01', 'operator-03', 'operator-06'] as const;

const SLIDES: Slide[] = [
  {
    key: 'station',
    eyebrow: 'Where you are',
    title: 'ORBITAL-09',
    body: 'A station losing systems faster than its crew can fix them. You are one of the crew, and there are not many of you.',
    art: (
      <div className="flex items-end justify-center gap-1">
        {CREW.map((avatar, index) => (
          <HumanCharacter
            key={avatar}
            appearance={deriveAppearance(`tour-${index}`)}
            avatarId={avatar}
            animated
            className="size-24 sm:size-28"
          />
        ))}
      </div>
    ),
  },
  {
    key: 'objectives',
    eyebrow: 'What you do',
    title: 'Work the station',
    body: 'Terminals across the station need calibrating, routing and repairing. Every objective the crew finishes brings you closer to winning outright.',
    art: <ObjectiveArt />,
  },
  {
    key: 'cat',
    eyebrow: 'The problem',
    title: 'One of you is not crew',
    body: 'Something came aboard wearing a crew member. It looks exactly like everybody else — same face, same uniform, same walk. Nothing about it looks wrong.',
    cat: true,
    art: (
      <div className="relative grid place-items-center">
        <CatSilhouette className="size-32 text-void-700 sm:size-36" />
        <span className="absolute top-[36%] flex gap-5">
          <span className="block size-2.5 rounded-full bg-cat-eye shadow-[0_0_14px_5px_var(--color-cat-eye)]" />
          <span className="block size-2.5 rounded-full bg-cat-eye shadow-[0_0_14px_5px_var(--color-cat-eye)]" />
        </span>
      </div>
    ),
  },
  {
    key: 'find',
    eyebrow: 'How you win',
    title: 'Work out who',
    body: 'Report what you find. Call a meeting. Say where you were and who was with you. Then vote — and be right, because you only get so many wrong answers.',
    art: <MeetingArt />,
  },
  {
    key: 'be-cat',
    eyebrow: 'And if it is you',
    title: 'You are the Cat',
    body: 'Blend in. Do objectives you cannot complete. Be somewhere plausible. Eliminate the crew one at a time, and make sure somebody else takes the blame.',
    cat: true,
    art: <CatCharacter expression="SMIRK" animated className="size-32 sm:size-36" />,
  },
];

export interface HowToPlayProps {
  /** Called on finish or skip. */
  onDone: () => void;
  /** Renders as a full-screen overlay rather than page content. */
  overlay?: boolean;
  /**
   * Which slide to open on. Defaults to the first.
   *
   * Exists so the review harness can screenshot a middle slide - a headless
   * browser cannot press Next, and the slide that carries the whole idea is
   * the third one.
   */
  initialSlide?: number;
}

export function HowToPlay({ onDone, overlay = false, initialSlide = 0 }: HowToPlayProps) {
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(0, initialSlide), SLIDES.length - 1),
  );
  const slide = SLIDES[index]!;
  const last = index === SLIDES.length - 1;

  return (
    <div
      className={cn(
        'flex flex-col items-center px-safe py-6',
        overlay ? 'fixed inset-0 z-50' : 'min-h-screen-safe',
        slide.cat ? 'cat-backdrop' : 'station-backdrop',
        // The backdrop change is the only thing that marks the turn, so it
        // gets a slow fade rather than a cut.
        'transition-[background-color] duration-700',
      )}
      role={overlay ? 'dialog' : undefined}
      aria-modal={overlay ? true : undefined}
      aria-label="How to play"
    >
      <div className="flex w-full max-w-md flex-1 flex-col">
        {/* ------------------------------------------------------- skip - */}

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onDone}>
            {last ? 'Close' : 'Skip'}
          </Button>
        </div>

        {/* --------------------------------------------------------- art - */}

        <div className="grid min-h-44 flex-1 place-items-center py-4 sm:min-h-52">
          {/* Keyed so each slide's art animates in rather than swapping in place. */}
          <div key={slide.key} className="animate-pop">
            {slide.art}
          </div>
        </div>

        {/* -------------------------------------------------------- copy - */}

        <div key={`${slide.key}-copy`} className="animate-rise text-center">
          <p
            className={cn(
              'font-mono text-xs tracking-[0.3em] uppercase',
              slide.cat ? 'text-cat' : 'text-ink-faint',
            )}
          >
            {slide.eyebrow}
          </p>
          <h1
            className={cn(
              'mt-2 font-display text-2xl font-bold sm:text-3xl',
              slide.cat ? 'text-cat' : 'text-ink',
            )}
          >
            {slide.title}
          </h1>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-muted">{slide.body}</p>
        </div>

        {/* ------------------------------------------------------- dots - */}

        <div className="mt-6 flex justify-center gap-2" aria-hidden>
          {SLIDES.map((entry, i) => (
            <span
              key={entry.key}
              className={cn(
                'block h-1.5 rounded-full transition-all duration-300',
                i === index
                  ? slide.cat
                    ? 'w-6 bg-cat'
                    : 'w-6 bg-signal'
                  : 'w-1.5 bg-void-600',
              )}
            />
          ))}
        </div>

        {/* ------------------------------------------------------ pager - */}

        <div className="mt-4 flex gap-2">
          {index > 0 ? (
            <Button variant="secondary" onClick={() => setIndex((n) => n - 1)}>
              Back
            </Button>
          ) : null}

          <Button
            fullWidth
            size="lg"
            onClick={() => (last ? onDone() : setIndex((n) => n + 1))}
            className={cn(
              slide.cat &&
                !last &&
                // Also clears the primary variant's teal glow, which otherwise
                // stays behind a violet button and reads as a rendering fault.
                'bg-cat text-void-950 shadow-[0_0_0_1px_var(--color-cat-dim),0_8px_24px_-12px_var(--color-cat)] hover:bg-cat/90',
            )}
          >
            {last ? 'Got it' : 'Next'}
          </Button>
        </div>

        <p className="mt-3 text-center text-xs text-ink-faint">
          {index + 1} of {SLIDES.length}
        </p>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- art - */

/** A terminal mid-calibration. The same visual language as the real panel. */
function ObjectiveArt() {
  return (
    <div className="w-56 rounded-2xl border border-void-700 bg-void-900 p-4">
      <p className="font-mono text-[0.625rem] tracking-[0.2em] text-caution uppercase">Objective</p>
      <p className="mt-1 font-display text-sm font-bold text-ink">Reactor Calibration</p>

      <div className="mt-3 flex flex-col gap-2.5">
        {[68, 34, 82].map((fill, index) => (
          <div key={index} className="relative h-2 rounded-full bg-void-800">
            <div
              className="h-full rounded-full bg-caution"
              style={{ width: `${fill}%` }}
            />
            <span
              className="absolute -top-1 h-4 w-0.5 rounded-full bg-signal"
              style={{ left: `${fill}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A council in progress: four crew, one of them already gone. */
function MeetingArt() {
  return (
    <div className="grid w-56 grid-cols-2 gap-2">
      {['operator-02', 'operator-04', 'operator-05', 'operator-07'].map((avatar, index) => (
        <div
          key={avatar}
          className={cn(
            'flex items-center gap-2 rounded-xl border p-1.5',
            index === 2 ? 'border-void-700 bg-void-900/50 opacity-50' : 'border-void-700 bg-void-900',
          )}
        >
          <HumanCharacter
            appearance={{ ...DEFAULT_APPEARANCE, ...deriveAppearance(`council-${index}`) }}
            avatarId={avatar}
            expression={index === 2 ? 'DEAD' : 'SUSPICIOUS'}
            className="size-9"
          />
          <span className="h-1.5 flex-1 rounded-full bg-void-700" />
        </div>
      ))}
    </div>
  );
}
