import { cn } from '@/lib/cn';

/**
 * The Cat.
 *
 * Something got aboard ORBITAL-09 wearing a crew face. This is what is
 * actually under it.
 *
 * WHERE THIS IS ALLOWED TO APPEAR, and nowhere else:
 *
 *   1. The private role reveal, on the screen of the player who is the Cat.
 *   2. That player's own HUD affordances.
 *   3. The results screen, after the match has ended and roles are public.
 *   4. Marketing surfaces - the logo, the splash, onboarding - where it is
 *      the game's identity rather than a statement about any one player.
 *
 * It must never be rendered from a broadcast payload, because no broadcast
 * payload carries a role (§BG). If you find yourself reaching for this
 * component while holding a `PublicPlayerState`, the design is wrong, not the
 * type.
 *
 * DESIGN: the silhouette does the work - two hard triangular ears, a round
 * head far too big for the body, and a tail that curls up past the shoulder.
 * Those three read at 20px. Everything else is detail for the reveal, where
 * the Cat is 200px tall and has the screen to itself.
 *
 * Deliberately not frightening. The Cat is mischievous and pleased with
 * itself - a creature that finds this funny. A horror cat would make being
 * the Cat feel like a punishment, and being the Cat is the best thing that
 * can happen to you in this game.
 */

export type CatExpression =
  | 'NORMAL'
  | 'SUSPICIOUS'
  | 'SMIRK'
  | 'ANGRY'
  | 'SNEAKY'
  | 'SHOCKED'
  | 'HAPPY'
  | 'DEFEATED';

export type CatPose = 'SIT' | 'CROUCH';

/** Fur, eyes and trim. One palette, so every expression is the same animal. */
const FUR = '#2E2740';
const FUR_LIGHT = '#3E3457';
/** The head sits a shade lighter than the body, so the two never merge. */
const FUR_HEAD = '#372F4C';
const FUR_DARK = '#221C30';
const EYE = '#FFA621';
const PINK = '#FF9EB5';
const COLLAR = '#FF5C74';
const TAG = '#FFA621';

export interface CatCharacterProps {
  expression?: CatExpression;
  pose?: CatPose;
  /** Adds the idle breathing loop and a slow tail sway. */
  animated?: boolean;
  name?: string | null;
  className?: string;
}

export function CatCharacter({
  expression = 'NORMAL',
  pose = 'SIT',
  animated = false,
  name,
  className,
}: CatCharacterProps) {
  const crouched = pose === 'CROUCH';

  return (
    <svg
      viewBox="0 0 100 140"
      className={cn('block size-24 shrink-0 overflow-visible', className)}
      role={name ? 'img' : undefined}
      aria-label={name ?? undefined}
      aria-hidden={name ? undefined : true}
    >
      <g
        className={cn(animated && 'animate-character-idle')}
        style={{ transformOrigin: '50px 130px' }}
      >
        {/*
         * Same 100x140 frame as HumanCharacter, and the feet land on the same
         * line. That is what lets the role reveal cross-dissolve one into the
         * other without either of them jumping.
         */}
        <Tail animated={animated} />
        <Body crouched={crouched} />
        <Head crouched={crouched} />
        <Ears crouched={crouched} expression={expression} />
        <CatFace expression={expression} />
        <Collar crouched={crouched} />
      </g>
    </svg>
  );
}

/* ================================================================= body = */

function Body({ crouched }: { crouched: boolean }) {
  if (crouched) {
    // Low and long: the shape of something moving along a wall.
    return (
      <g>
        <ellipse cx="50" cy="112" rx="34" ry="17" fill={FUR} stroke={FUR_DARK} strokeWidth="2.5" />
        <ellipse cx="50" cy="107" rx="28" ry="11" fill={FUR_LIGHT} opacity="0.35" />
        <Paw x={26} y={124} />
        <Paw x={44} y={126} />
        <Paw x={62} y={126} />
      </g>
    );
  }

  return (
    <g>
      {/* Sitting: a teardrop, wide at the base. */}
      <path d="M50 78c17 0 27 16 27 31 0 12-12 18-27 18s-27-6-27-18c0-15 10-31 27-31Z" fill={FUR} stroke={FUR_DARK} strokeWidth="2.5" />
      <path d="M50 84c11 0 18 11 18 22 0-9-7-16-18-16s-18 7-18 16c0-11 7-22 18-22Z" fill={FUR_LIGHT} opacity="0.4" />
      <Paw x={34} y={120} />
      <Paw x={56} y={120} />
    </g>
  );
}

/** A front paw. Three toe lines, which is all a paw needs to be a paw. */
function Paw({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width="16" height="9" rx="4.5" fill={FUR_DARK} />
      <g stroke={FUR} strokeWidth="1.2" strokeLinecap="round">
        <path d={`M${x + 5} ${y + 2}v3M${x + 8} ${y + 1.5}v3.5M${x + 11} ${y + 2}v3`} />
      </g>
    </g>
  );
}

function Tail({ animated }: { animated: boolean }) {
  return (
    <g
      className={cn(animated && 'animate-cat-tail')}
      style={{ transformOrigin: '76px 110px' }}
    >
      {/*
       * The tail curls up and forward past the shoulder rather than trailing
       * behind. It is the one line that makes the silhouette unmistakable at
       * any size, so it belongs inside the frame, not off the edge of it.
       */}
      <path
        d="M74 112c14 2 22-6 22-18s-8-22-18-24c6 6 9 14 9 22s-4 13-13 12Z"
        fill={FUR}
      />
      <path d="M84 76c4 4 6 10 6 16" stroke={FUR_LIGHT} strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.5" />
    </g>
  );
}

function Head({ crouched }: { crouched: boolean }) {
  const cy = crouched ? 78 : 50;
  return (
    <g>
      <ellipse cx="50" cy={cy} rx="31" ry="27" fill={FUR_HEAD} stroke={FUR_DARK} strokeWidth="2.5" />
      {/* Cheek fluff: two scallops that break the perfect oval. */}
      <path
        d={`M19 ${cy + 4}c-4 3-5 7-3 10 3-3 6-4 9-4Zm62 0c4 3 5 7 3 10-3-3-6-4-9-4Z`}
        fill={FUR}
      />
      <ellipse cx="50" cy={cy - 6} rx="24" ry="17" fill={FUR_LIGHT} opacity="0.3" />
      {/* Muzzle, pale, so the nose and mouth sit on something. */}
      <ellipse cx="50" cy={cy + 13} rx="15" ry="10" fill={FUR_LIGHT} opacity="0.55" />
    </g>
  );
}

function Ears({ crouched, expression }: { crouched: boolean; expression: CatExpression }) {
  const cy = crouched ? 78 : 50;

  /*
   * Ears carry mood before the face does - a real cat's do, and so do these.
   * Flat back for anger and defeat, upright and forward for everything else.
   * The reveal reads correctly even as a black silhouette because of this.
   */
  const flat = expression === 'ANGRY' || expression === 'DEFEATED';

  if (flat) {
    return (
      <g>
        <path d={`M24 ${cy - 16} 6 ${cy - 10}l18 10Z`} fill={FUR} />
        <path d={`M76 ${cy - 16} 94 ${cy - 10}l-18 10Z`} fill={FUR} />
        <path d={`M24 ${cy - 13} 13 ${cy - 9}l11 6Z`} fill={PINK} opacity="0.7" />
        <path d={`M76 ${cy - 13} 87 ${cy - 9}l-11 6Z`} fill={PINK} opacity="0.7" />
      </g>
    );
  }

  return (
    <g>
      <path d={`M26 ${cy - 18} 20 ${cy - 48} 52 ${cy - 24}Z`} fill={FUR} />
      <path d={`M74 ${cy - 18} 80 ${cy - 48} 48 ${cy - 24}Z`} fill={FUR} />
      {/* Inner ear. Set in from the edge, or it reads as a pink ear. */}
      <path d={`M29 ${cy - 21} 25 ${cy - 40} 43 ${cy - 25}Z`} fill={PINK} />
      <path d={`M71 ${cy - 21} 75 ${cy - 40} 57 ${cy - 25}Z`} fill={PINK} />
    </g>
  );
}

function Collar({ crouched }: { crouched: boolean }) {
  const y = crouched ? 96 : 76;
  return (
    <g>
      {/*
       * The collar is the Cat's one piece of costume, and the detail that
       * says this is somebody's idea of a joke: whatever this is, it came
       * aboard wearing a name tag.
       */}
      <rect x="27" y={y} width="46" height="9" rx="4.5" fill={COLLAR} />
      <rect x="27" y={y} width="46" height="3.5" rx="1.75" fill="#FFFFFF" opacity="0.22" />
      <circle cx="50" cy={y + 13} r="6.5" fill={TAG} />
      <circle cx="50" cy={y + 13} r="3" fill={FUR_DARK} />
    </g>
  );
}

/* ================================================================= face = */

/**
 * Eight expressions.
 *
 * The slit pupil is the constant - it is the one feature that says *cat* with
 * no ambiguity, so it survives every expression except the two where the eyes
 * are closed. Everything else moves.
 */
function CatFace({ expression }: { expression: CatExpression }) {
  return (
    <g>
      <CatEyes expression={expression} />
      <Nose />
      <Mouth expression={expression} />
      <Whiskers />
    </g>
  );
}

function CatEyes({ expression }: { expression: CatExpression }) {
  switch (expression) {
    case 'HAPPY':
      // Closed, arched upward. A cat this pleased does not need to look.
      return (
        <g fill="none" stroke={FUR_DARK} strokeWidth="3.5" strokeLinecap="round">
          <path d="M28 48c4-6 12-6 16 0M56 48c4-6 12-6 16 0" />
        </g>
      );

    case 'DEFEATED':
      return (
        <g fill="none" stroke={FUR_DARK} strokeWidth="3.5" strokeLinecap="round">
          <path d="M28 46c4 6 12 6 16 0M56 46c4 6 12 6 16 0" />
        </g>
      );

    case 'SHOCKED':
      // Pupils blown wide - the one expression where the slit disappears.
      return (
        <g>
          <Eye cx={36} rx={11} ry={12} />
          <Eye cx={64} rx={11} ry={12} />
          <circle cx="36" cy="46" r="6" fill={FUR_DARK} />
          <circle cx="64" cy="46" r="6" fill={FUR_DARK} />
          <circle cx="33.5" cy="43" r="2.2" fill="#FFFFFF" />
          <circle cx="61.5" cy="43" r="2.2" fill="#FFFFFF" />
        </g>
      );

    case 'ANGRY':
      return (
        <g>
          <Eye cx={36} rx={10} ry={8} />
          <Eye cx={64} rx={10} ry={8} />
          <Slit cx={36} ry={7} />
          <Slit cx={64} ry={7} />
          {/* Brows driving down toward the nose. */}
          <g stroke={FUR_DARK} strokeWidth="4" strokeLinecap="round">
            <path d="M26 34l16 6M74 34l-16 6" />
          </g>
        </g>
      );

    case 'SUSPICIOUS':
      return (
        <g>
          <Eye cx={36} rx={10} ry={7} />
          <Eye cx={64} rx={10} ry={7} />
          {/* Both pupils cut to one side: looking at you, not at the room. */}
          <Slit cx={39} ry={6} />
          <Slit cx={67} ry={6} />
          <g stroke={FUR_DARK} strokeWidth="3.5" strokeLinecap="round">
            <path d="M27 36l16 3M73 36l-16 3" />
          </g>
        </g>
      );

    case 'SNEAKY':
      // Half-lidded. The lid is a fur-coloured bar over the top of the eye,
      // not a smaller eye - a squint has to keep the eye's full width.
      return (
        <g>
          <Eye cx={36} rx={10} ry={9} />
          <Eye cx={64} rx={10} ry={9} />
          <Slit cx={36} ry={8} />
          <Slit cx={64} ry={8} />
          <path d="M26 46h20v-10h-20ZM54 46h20v-10h-20Z" fill={FUR} />
          <g stroke={FUR_DARK} strokeWidth="2.5" strokeLinecap="round">
            <path d="M26 46h20M54 46h20" />
          </g>
        </g>
      );

    case 'SMIRK':
      return (
        <g>
          <Eye cx={36} rx={10} ry={9} />
          <Eye cx={64} rx={10} ry={9} />
          <Slit cx={36} ry={8} />
          <Slit cx={64} ry={8} />
          {/* One brow up. The entire difference between smug and neutral. */}
          <path d="M26 33l16 4" stroke={FUR_DARK} strokeWidth="3.5" strokeLinecap="round" />
        </g>
      );

    case 'NORMAL':
    default:
      return (
        <g>
          <Eye cx={36} rx={10} ry={10} />
          <Eye cx={64} rx={10} ry={10} />
          <Slit cx={36} ry={9} />
          <Slit cx={64} ry={9} />
        </g>
      );
  }
}

function Eye({ cx, rx, ry }: { cx: number; rx: number; ry: number }) {
  return <ellipse cx={cx} cy="46" rx={rx} ry={ry} fill={EYE} />;
}

/** The vertical slit pupil, with its catchlight. */
function Slit({ cx, ry }: { cx: number; ry: number }) {
  return (
    <g>
      <ellipse cx={cx} cy="46" rx="2.6" ry={ry} fill={FUR_DARK} />
      <circle cx={cx - 3} cy={41} r="1.8" fill="#FFFFFF" opacity="0.9" />
    </g>
  );
}

function Nose() {
  return (
    <g>
      <path d="M44.5 56.5h11l-5.5 6.5Z" fill={PINK} stroke={FUR_DARK} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M50 63v4" stroke={FUR_DARK} strokeWidth="1.8" strokeLinecap="round" />
    </g>
  );
}

function Mouth({ expression }: { expression: CatExpression }) {
  const stroke = { stroke: FUR_DARK, strokeWidth: 2.4, strokeLinecap: 'round' as const, fill: 'none' };

  switch (expression) {
    case 'SMIRK':
      // Up on one side only, with a tooth. The signature.
      return (
        <g>
          {/* One long curve lifting to the left, and a tooth at the high end. */}
          <path d="M39 65q6 5 12 1t10 -8" {...stroke} strokeWidth={2.8} />
          <path d="M58 57.5l4 3.5-5.5 1.5Z" fill="#FFFFFF" stroke={FUR_DARK} strokeWidth="1" strokeLinejoin="round" />
        </g>
      );

    case 'HAPPY':
      return (
        <g>
          <path d="M42 66q8 8 16 0" {...stroke} strokeWidth="2.8" />
          <path d="M46 68h8q-4 5-8 0Z" fill={PINK} opacity="0.85" />
        </g>
      );

    case 'ANGRY':
      return (
        <g>
          {/* Open, with both fangs. */}
          <path d="M40 66q10 12 20 0q-10 4-20 0Z" fill={FUR_DARK} />
          <path d="M43 67l2 5 3-4Zm14 0l-2 5-3-4Z" fill="#FFFFFF" />
        </g>
      );

    case 'SHOCKED':
      return <ellipse cx="50" cy="70" rx="5" ry="6" fill={FUR_DARK} />;

    case 'DEFEATED':
      return <path d="M43 70q7-5 14 0" {...stroke} />;

    case 'SNEAKY':
      return (
        <g>
          <path d="M43 67q7 4 14 0" {...stroke} />
          <path d="M55 66l2.5 4-4-1Z" fill="#FFFFFF" />
        </g>
      );

    case 'SUSPICIOUS':
      return <path d="M43 68h14" {...stroke} />;

    case 'NORMAL':
    default:
      // The classic two-curve cat mouth.
      return <path d="M50 66q-6 6-10.5 1M50 66q6 6 10.5 1" {...stroke} strokeWidth={2.8} />;
  }
}

function Whiskers() {
  return (
    <g stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" opacity="0.55">
      <path d="M32 60 12 56M32 64 13 65M33 68 15 74" />
      <path d="M68 60 88 56M68 64 87 65M67 68 85 74" />
    </g>
  );
}

/**
 * The Cat reduced to an outline.
 *
 * Used by the role reveal, where the human silhouette becomes this one, and
 * by the logo. Filled with `currentColor` and carrying no interior detail, so
 * it works as a shadow passing over a wall.
 */
export function CatSilhouette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 140" className={cn('block size-24', className)} aria-hidden>
      <path
        d="M26 32 20 2 52 26h-4L48 26 80 2l-6 30c6 5 10 12 10 20 0 4-1 8-3 11 10 6 16 18 16 30 0 14-14 24-35 24S25 107 25 93c0-12 6-24 16-30-2-3-3-7-3-11 0-8 4-15 10-20Z"
        fill="currentColor"
      />
    </svg>
  );
}
