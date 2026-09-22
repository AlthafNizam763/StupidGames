import { cn } from '@/lib/cn';
import {
  derivedAppearance,
  hairColour,
  skinTone,
  uniformColour,
  type CharacterAppearance,
} from './appearance';
import { HumanCharacter, type Expression, type Pose } from './HumanCharacter';

/**
 * A player, drawn.
 *
 * The component every screen reaches for. It takes the fields that actually
 * travel on the wire - id, username, avatar - and produces a character,
 * falling back to a derived appearance until the player has chosen one.
 *
 * There is no role parameter and there will not be one. Every player on every
 * screen is drawn by this, which is what makes the Cat invisible: the code
 * that draws them does not know, and could not act on it if it did.
 */

export interface PlayerCharacterProps {
  userId: string;
  username: string;
  avatarId: string;
  /** A chosen appearance. Omitted, one is derived from the id (stable everywhere). */
  appearance?: CharacterAppearance;
  expression?: Expression;
  pose?: Pose;
  animated?: boolean;
  /** Labels the figure for screen readers. Off when a username sits beside it. */
  labelled?: boolean;
  className?: string;
}

export function PlayerCharacter({
  userId,
  username,
  avatarId,
  appearance,
  expression = 'NORMAL',
  pose = 'IDLE',
  animated = false,
  labelled = false,
  className,
}: PlayerCharacterProps) {
  const resolved = appearance ?? derivedAppearance(userId, avatarId);

  return (
    <HumanCharacter
      appearance={resolved}
      avatarId={avatarId}
      expression={expression}
      pose={pose}
      animated={animated}
      name={labelled ? username : null}
      className={className}
    />
  );
}

/**
 * Head and shoulders, for lists.
 *
 * A lobby of fifteen full-body characters is fifteen times the SVG for
 * something rendered 32px tall, where the legs are four pixels and the shoes
 * are invisible. This crops to the part that carries the identity - hair,
 * face, uniform colour - and drops the rest.
 */
export function CharacterBust({
  userId,
  username,
  avatarId,
  appearance,
  expression = 'NORMAL',
  labelled = false,
  className,
}: Omit<PlayerCharacterProps, 'pose' | 'animated'>) {
  const resolved = appearance ?? derivedAppearance(userId, avatarId);
  const uniform = uniformColour(avatarId);
  const skin = skinTone(resolved.skin);
  const hair = hairColour(resolved.hairColour);

  return (
    <span
      className={cn(
        'relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl',
        'border border-void-600 bg-void-800',
        className,
      )}
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? username : undefined}
      aria-hidden={labelled ? undefined : true}
    >
      {/*
       * A wash of the player's uniform colour behind the bust. At 32px the
       * uniform itself is a few pixels, and colour is how players refer to
       * each other out loud - "the teal one went into Reactor" has to work.
       */}
      <span
        aria-hidden
        className="absolute inset-0 opacity-25"
        style={{ backgroundColor: uniform }}
      />
      <svg viewBox="16 14 68 62" className="relative block size-full">
        <ellipse cx="50" cy="78" rx="26" ry="16" fill={uniform} />
        <rect x="44" y="60" width="12" height="14" rx="5" fill={skin.shadow} />
        <ellipse cx="50" cy="44" rx="27" ry="26" fill={skin.base} />
        <ellipse cx="23.5" cy="47" rx="4" ry="5.5" fill={skin.base} />
        <ellipse cx="76.5" cy="47" rx="4" ry="5.5" fill={skin.base} />

        {/* Eyes only. A mouth at this size is one grey pixel. */}
        {expression === 'DEAD' ? (
          <g stroke="#241F2B" strokeWidth="3" strokeLinecap="round">
            <path d="M36 44l8 8M44 44l-8 8M56 44l8 8M64 44l-8 8" />
          </g>
        ) : (
          <g>
            <ellipse cx="40" cy="48" rx="6" ry="7" fill="#FFFFFF" />
            <ellipse cx="60" cy="48" rx="6" ry="7" fill="#FFFFFF" />
            <circle cx="40" cy="49" r="3.4" fill="#241F2B" />
            <circle cx="60" cy="49" r="3.4" fill="#241F2B" />
          </g>
        )}

        {/* A simplified cap of hair: the silhouette, without the detail. */}
        <path
          d="M23 44A27 26 0 0 1 77 44C74 32 62 30 50 31 38 30 26 32 23 44Z"
          fill={hair.base}
        />
      </svg>
    </span>
  );
}
