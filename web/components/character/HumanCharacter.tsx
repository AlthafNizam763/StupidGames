import { cn } from '@/lib/cn';
import {
  BodyType,
  hairColour,
  shoeColour,
  skinTone,
  uniformColour,
  type CharacterAppearance,
} from './appearance';

/**
 * The human character.
 *
 * Every player on ORBITAL-09 is drawn by this component and only by this
 * component - Operators and the Cat alike. That is not a convenience, it is
 * the rule the game rests on (§BG): if the Cat had their own renderer, their
 * own palette, their own idle timing or their own outline weight, somebody
 * would notice within three matches and the game would be solved.
 *
 * So there is no `role` prop here, and there must never be one. The Cat's own
 * client learns what it is from `GameSelfState`, and the only place that shows
 * is the private role reveal and the Cat's own HUD.
 *
 * Original artwork for this project. Drawn as inline SVG rather than shipped
 * as sprite sheets because the character is modular: eight hairstyles times
 * six outfits times six skin tones times eight uniform colours is not a set of
 * files anybody can keep in sync, but it is a handful of paths and a palette.
 */

export type Expression =
  | 'NORMAL'
  | 'HAPPY'
  | 'SURPRISED'
  | 'SCARED'
  | 'SUSPICIOUS'
  | 'DEAD';

export type Pose = 'IDLE' | 'WALK' | 'CHEER' | 'SLUMP';

export interface HumanCharacterProps {
  appearance: CharacterAppearance;
  /** Avatar preset id. Supplies the uniform colour, which is the player's identity. */
  avatarId: string;
  expression?: Expression;
  pose?: Pose;
  /** Accessible name. Pass null beside a visible username. */
  name?: string | null;
  /** Adds the idle breathing loop. Off inside lists, where 20 of them would churn. */
  animated?: boolean;
  className?: string;
}

export function HumanCharacter({
  appearance,
  avatarId,
  expression = 'NORMAL',
  pose = 'IDLE',
  name,
  animated = false,
  className,
}: HumanCharacterProps) {
  const skin = skinTone(appearance.skin);
  const hair = hairColour(appearance.hairColour);
  const uniform = uniformColour(avatarId);
  const soles = shoeColour(appearance.shoes);
  const girl = appearance.body === BodyType.GIRL;

  return (
    <svg
      viewBox="0 0 100 140"
      className={cn('block size-24 shrink-0 overflow-visible', className)}
      role={name ? 'img' : undefined}
      aria-label={name ?? undefined}
      aria-hidden={name ? undefined : true}
    >
      {/*
       * The whole figure breathes as one group. Animating the head separately
       * from the body is how a character starts looking like a puppet with a
       * loose neck.
       */}
      <g className={cn(animated && 'animate-character-idle')} style={{ transformOrigin: '50px 130px' }}>
        <Backpack appearance={appearance} uniform={uniform} />
        <BackHair appearance={appearance} hair={hair} />
        <Legs appearance={appearance} skin={skin} soles={soles} pose={pose} girl={girl} />
        <Torso appearance={appearance} uniform={uniform} skin={skin} girl={girl} />
        <Arms uniform={uniform} skin={skin} pose={pose} girl={girl} />
        <Head skin={skin} />
        <Face expression={expression} />
        <FrontHair appearance={appearance} hair={hair} />
        <Accessory appearance={appearance} hair={hair} />
      </g>
    </svg>
  );
}

/* =========================================================== body parts = */

function Head({ skin }: { skin: { base: string; shadow: string } }) {
  return (
    <g>
      {/* Neck, behind the jaw so the join never shows. */}
      <rect x="44" y="62" width="12" height="14" rx="5" fill={skin.shadow} />
      <ellipse cx="50" cy="44" rx="27" ry="26" fill={skin.base} />
      {/* One shadow under the jaw. Enough to read as round; no gradients. */}
      <path d="M26 52a27 26 0 0 0 48 0 27 26 0 0 1-48 0Z" fill={skin.shadow} opacity="0.5" />
      {/* Ears. Small, but they hold the silhouette together at the sides. */}
      <ellipse cx="23.5" cy="47" rx="4" ry="5.5" fill={skin.base} />
      <ellipse cx="76.5" cy="47" rx="4" ry="5.5" fill={skin.base} />
    </g>
  );
}

function Torso({
  appearance,
  uniform,
  skin,
  girl,
}: {
  appearance: CharacterAppearance;
  uniform: string;
  skin: { base: string; shadow: string };
  girl: boolean;
}) {
  // The girl silhouette is narrower at the shoulder and a touch wider at the
  // hip. A difference in outline, not in detail - it has to survive being
  // drawn 40px tall on a phone.
  const shoulder = girl ? 33 : 30;
  const width = 100 - shoulder * 2;

  switch (appearance.outfit) {
    case 'fit-skirt':
      return (
        <g>
          <path
            d={`M${shoulder} 84c0-6 4-10 ${width / 2 - 1} -10s${width / 2 - 1} 4 ${width / 2 - 1} 10v12H${shoulder}Z`}
            fill={uniform}
          />
          {/* The skirt flares past the torso, which is the whole silhouette. */}
          <path d={`M${shoulder - 6} 108 ${shoulder + 3} 94h${width - 6}l9 14Z`} fill={uniform} />
          <path d={`M${shoulder - 6} 108h${width + 12}`} stroke="#00000033" strokeWidth="2" />
        </g>
      );

    case 'fit-dungarees':
      return (
        <g>
          <rect x={shoulder} y="76" width={width} height="32" rx="7" fill={skin.base} />
          <rect x={shoulder} y="86" width={width} height="22" rx="4" fill={uniform} />
          {/* Two straps over the shoulders, the thing that makes them read as dungarees. */}
          <rect x={shoulder + 5} y="76" width="5" height="14" rx="2.5" fill={uniform} />
          <rect x={100 - shoulder - 10} y="76" width="5" height="14" rx="2.5" fill={uniform} />
        </g>
      );

    case 'fit-hoodie':
      return (
        <g>
          <rect x={shoulder - 2} y="76" width={width + 4} height="32" rx="9" fill={uniform} />
          {/* Hood, bunched behind the neck. */}
          <path d={`M${shoulder + 4} 78c4 8 26 8 30 0-4-6-26-6-30 0Z`} fill="#00000038" />
          <rect x="47" y="90" width="6" height="10" rx="3" fill="#00000030" />
        </g>
      );

    case 'fit-jacket':
      return (
        <g>
          <rect x={shoulder} y="76" width={width} height="32" rx="7" fill={uniform} />
          {/* Collar and open zip line. */}
          <path d={`M44 76 50 86 56 76Z`} fill="#00000040" />
          <rect x="49" y="84" width="2" height="24" fill="#00000040" />
          <rect x={shoulder} y="100" width={width} height="4" fill="#00000026" />
        </g>
      );

    case 'fit-vest':
      return (
        <g>
          <rect x={shoulder} y="76" width={width} height="32" rx="7" fill={uniform} />
          <rect x={shoulder + 4} y="88" width={width - 8} height="8" rx="2" fill="#00000038" />
          {/* Two pouches. The vest is the "carries things" silhouette. */}
          <rect x={shoulder - 3} y="92" width="6" height="9" rx="2" fill="#00000045" />
          <rect x={100 - shoulder - 3} y="92" width="6" height="9" rx="2" fill="#00000045" />
        </g>
      );

    case 'fit-jumpsuit':
    default:
      return (
        <g>
          <rect x={shoulder} y="76" width={width} height="32" rx="7" fill={uniform} />
          {/* Chest seam and belt: the station-issue look. */}
          <path d={`M${shoulder + 6} 76 50 84l${width / 2 - 6} -8`} stroke="#00000033" strokeWidth="2" fill="none" />
          <rect x={shoulder} y="97" width={width} height="5" fill="#00000033" />
        </g>
      );
  }
}

function Arms({
  uniform,
  skin,
  pose,
  girl,
}: {
  uniform: string;
  skin: { base: string; shadow: string };
  pose: Pose;
  girl: boolean;
}) {
  const shoulder = girl ? 33 : 30;

  // Arms carry almost all of the pose. Hands are a dot on the end of a
  // capsule, which is all that survives at this size anyway.
  if (pose === 'CHEER') {
    return (
      <g>
        <g transform="rotate(-42 34 82)">
          <rect x={shoulder - 7} y="78" width="8" height="26" rx="4" fill={uniform} />
          <circle cx={shoulder - 3} cy="104" r="5" fill={skin.base} />
        </g>
        <g transform="rotate(42 66 82)">
          <rect x={100 - shoulder - 1} y="78" width="8" height="26" rx="4" fill={uniform} />
          <circle cx={100 - shoulder + 3} cy="104" r="5" fill={skin.base} />
        </g>
      </g>
    );
  }

  const droop = pose === 'SLUMP' ? 6 : 0;

  return (
    <g>
      <rect x={shoulder - 7} y={78 + droop} width="8" height="24" rx="4" fill={uniform} />
      <circle cx={shoulder - 3} cy={103 + droop} r="5" fill={skin.base} />
      <rect x={100 - shoulder - 1} y={78 + droop} width="8" height="24" rx="4" fill={uniform} />
      <circle cx={100 - shoulder + 3} cy={103 + droop} r="5" fill={skin.base} />
    </g>
  );
}

function Legs({
  appearance,
  skin,
  soles,
  pose,
  girl,
}: {
  appearance: CharacterAppearance;
  skin: { base: string; shadow: string };
  soles: string;
  pose: Pose;
  girl: boolean;
}) {
  // Walk offsets one leg forward and the other back. A two-frame cycle reads
  // as walking at this scale; a four-frame one costs more and reads the same.
  const lift = pose === 'WALK' ? 3 : 0;
  const bare = appearance.outfit === 'fit-skirt';
  const legFill = bare ? skin.base : '#00000055';

  return (
    <g>
      <g transform={`translate(0 ${-lift})`}>
        <rect x={girl ? 40 : 39} y="104" width="9" height="20" rx="4" fill={legFill} />
        <rect x={girl ? 37 : 36} y={120} width="14" height="9" rx="4" fill={soles} />
      </g>
      <g transform={`translate(0 ${lift})`}>
        <rect x={girl ? 51 : 52} y="104" width="9" height="20" rx="4" fill={legFill} />
        <rect x={girl ? 49 : 50} y={120} width="14" height="9" rx="4" fill={soles} />
      </g>
    </g>
  );
}

/* ================================================================= hair = */

/** Hair that falls behind the figure. Drawn first, under everything. */
function BackHair({
  appearance,
  hair,
}: {
  appearance: CharacterAppearance;
  hair: { base: string; shine: string };
}) {
  switch (appearance.hair) {
    case 'hair-long':
      return <path d="M22 44c-4 26-2 44 2 52h52c4-8 6-26 2-52Z" fill={hair.base} />;
    case 'hair-bob':
      return <path d="M22 42c-3 14-2 22 0 28h56c2-6 3-14 0-28Z" fill={hair.base} />;
    case 'hair-ponytail':
      return (
        <g>
          <path d="M70 34c10 4 16 14 15 26-1 10-6 18-12 22l-8-5c6-4 10-11 10-19s-3-15-9-19Z" fill={hair.base} />
          <circle cx="71" cy="36" r="6" fill={hair.shine} />
        </g>
      );
    case 'hair-curls':
      return <ellipse cx="50" cy="42" rx="31" ry="27" fill={hair.base} />;
    default:
      return null;
  }
}

/** The cap of hair over the skull, plus whatever sits in front of it. */
function FrontHair({
  appearance,
  hair,
}: {
  appearance: CharacterAppearance;
  hair: { base: string; shine: string };
}) {
  /*
   * Every style is built from the same arc across the top of the head, with a
   * different hairline drawn back across it. Sharing the arc is what keeps
   * eight hairstyles sitting on the same skull instead of eight slightly
   * different ones.
   */
  const cap = (hairline: string) => `M23 44A27 26 0 0 1 77 44 ${hairline} Z`;

  switch (appearance.hair) {
    case 'hair-swept':
      return (
        <g>
          <path d={cap('C74 30 60 26 50 30 C40 26 27 32 23 44')} fill={hair.base} />
          {/* The sweep: one wing crossing the forehead, which is the whole look. */}
          <path d="M26 36c8-10 26-14 38-8-10 0-20 4-26 12Z" fill={hair.shine} />
        </g>
      );

    case 'hair-undercut':
      return (
        <g>
          {/* Short at the sides: the cap stops well above the ear line. */}
          <path d="M27 38A24 23 0 0 1 73 38C68 28 32 28 27 38Z" fill={hair.base} />
          <path d="M31 33c6-6 32-6 38 0-8-4-30-4-38 0Z" fill={hair.shine} />
        </g>
      );

    case 'hair-curls':
      return (
        <g>
          <path d={cap('C76 28 62 24 50 28 C38 24 24 30 23 44')} fill={hair.base} />
          {/* Bumps around the hairline. Curls are a silhouette, not a texture. */}
          {[28, 38, 50, 62, 72].map((x, i) => (
            <circle key={x} cx={x} cy={i % 2 === 0 ? 28 : 25} r={7} fill={hair.base} />
          ))}
          <circle cx="38" cy="26" r="3" fill={hair.shine} />
        </g>
      );

    case 'hair-bob':
      return (
        <g>
          <path d={cap('C75 30 58 27 50 31 C42 27 25 30 23 44')} fill={hair.base} />
          {/* Panels down past the jaw, squared off. */}
          <path d="M22 42c-2 12-1 20 1 26h8V42Z" fill={hair.base} />
          <path d="M78 42c2 12 1 20-1 26h-8V42Z" fill={hair.base} />
          <path d="M32 30c8-6 28-6 36 0-10-3-26-3-36 0Z" fill={hair.shine} />
        </g>
      );

    case 'hair-ponytail':
      return (
        <g>
          <path d={cap('C75 29 58 26 50 30 C42 26 25 29 23 44')} fill={hair.base} />
          <path d="M30 31c8-7 32-7 40 0-12-4-28-4-40 0Z" fill={hair.shine} />
        </g>
      );

    case 'hair-buns':
      return (
        <g>
          <path d={cap('C75 29 58 26 50 30 C42 26 25 29 23 44')} fill={hair.base} />
          <circle cx="27" cy="24" r="9" fill={hair.base} />
          <circle cx="73" cy="24" r="9" fill={hair.base} />
          <circle cx="25" cy="21" r="3.5" fill={hair.shine} />
          <circle cx="71" cy="21" r="3.5" fill={hair.shine} />
        </g>
      );

    case 'hair-long':
      return (
        <g>
          <path d={cap('C76 30 60 25 50 30 C40 25 24 30 23 44')} fill={hair.base} />
          {/* Two strands framing the face, so the long mass is not just a cape. */}
          <path d="M23 42c-1 14 0 22 2 28h7c-3-10-4-20-2-30Z" fill={hair.base} />
          <path d="M77 42c1 14 0 22-2 28h-7c3-10 4-20 2-30Z" fill={hair.base} />
          <path d="M34 29c8-5 26-5 34 0-10-2-24-2-34 0Z" fill={hair.shine} />
        </g>
      );

    case 'hair-crop':
    default:
      return (
        <g>
          <path d={cap('C74 32 62 30 50 31 C38 30 26 32 23 44')} fill={hair.base} />
          <path d="M31 32c7-7 27-7 34-1-10-3-24-3-34 1Z" fill={hair.shine} />
        </g>
      );
  }
}

/* ========================================================== attachments = */

function Accessory({
  appearance,
  hair,
}: {
  appearance: CharacterAppearance;
  hair: { base: string; shine: string };
}) {
  switch (appearance.accessory) {
    case 'acc-cap':
      return (
        <g>
          <path d="M24 38a26 24 0 0 1 52 0c-6-6-46-6-52 0Z" fill="#2B3446" />
          <path d="M24 38h30c8 0 10 3 10 5H24Z" fill="#1B2230" />
        </g>
      );

    case 'acc-glasses':
      return (
        <g fill="none" stroke="#1B2230" strokeWidth="2.5">
          <circle cx="40" cy="48" r="9" />
          <circle cx="60" cy="48" r="9" />
          <path d="M49 48h2M23 45l8 2M77 45l-8 2" />
        </g>
      );

    case 'acc-visor':
      return (
        <g>
          <rect x="24" y="40" width="52" height="14" rx="7" fill="#0A0E16" opacity="0.88" />
          <rect x="28" y="43" width="18" height="4" rx="2" fill="#3FE0BC" opacity="0.5" />
        </g>
      );

    case 'acc-headphones':
      return (
        <g>
          <path d="M22 46a28 26 0 0 1 56 0" stroke="#2B3446" strokeWidth="5" fill="none" strokeLinecap="round" />
          <rect x="16" y="42" width="11" height="16" rx="5" fill="#2B3446" />
          <rect x="73" y="42" width="11" height="16" rx="5" fill="#2B3446" />
          <rect x="19" y="46" width="5" height="8" rx="2.5" fill="#3FE0BC" opacity="0.6" />
        </g>
      );

    case 'acc-scarf':
      return (
        <g>
          <rect x="34" y="68" width="32" height="9" rx="4.5" fill="#FF5C74" />
          <path d="M60 74l7 16-9-3Z" fill="#D63F56" />
        </g>
      );

    case 'acc-cat-ears':
      return (
        <g>
          {/* A cosmetic anyone can wear. It says nothing about anybody (§BG). */}
          <path d="M28 26 26 10l16 9Z" fill={hair.base} />
          <path d="M72 26 74 10 58 19Z" fill={hair.base} />
          <path d="M30 23 29 15l7 4Z" fill="#FF9EB5" />
          <path d="M70 23 71 15l-7 4Z" fill="#FF9EB5" />
        </g>
      );

    default:
      return null;
  }
}

function Backpack({ appearance, uniform }: { appearance: CharacterAppearance; uniform: string }) {
  switch (appearance.backpack) {
    case 'bag-pack':
      return (
        <g>
          <rect x="24" y="76" width="52" height="28" rx="8" fill="#00000055" />
          <rect x="30" y="82" width="40" height="8" rx="3" fill={uniform} opacity="0.5" />
        </g>
      );
    case 'bag-tank':
      return (
        <g>
          <rect x="28" y="72" width="14" height="34" rx="7" fill="#4A5468" />
          <rect x="58" y="72" width="14" height="34" rx="7" fill="#4A5468" />
          <rect x="31" y="76" width="8" height="4" rx="2" fill="#E8EDF7" opacity="0.4" />
        </g>
      );
    case 'bag-satchel':
      return <rect x="22" y="88" width="20" height="18" rx="6" fill="#00000055" />;
    default:
      return null;
  }
}

/* ================================================================= face = */

/**
 * Expressions.
 *
 * Six, covering what the game actually needs to say: neutral play, a win, a
 * body discovered, a council accusation, an ejection. Each changes the eyes
 * *and* the mouth - an expression carried by only one of the two reads as a
 * glitch rather than a feeling.
 */
function Face({ expression }: { expression: Expression }) {
  const PUPIL = '#241F2B';

  if (expression === 'DEAD') {
    return (
      <g stroke={PUPIL} strokeWidth="3" strokeLinecap="round">
        <path d="M36 44l8 8M44 44l-8 8M56 44l8 8M64 44l-8 8" />
        <path d="M44 60h12" strokeWidth="2.5" />
      </g>
    );
  }

  if (expression === 'HAPPY') {
    return (
      <g>
        <g fill="none" stroke={PUPIL} strokeWidth="3" strokeLinecap="round">
          <path d="M34 50c3-5 9-5 12 0M54 50c3-5 9-5 12 0" />
        </g>
        <path d="M43 57c3 5 11 5 14 0" fill="none" stroke={PUPIL} strokeWidth="2.5" strokeLinecap="round" />
        {/* Blush only here. If every expression had it, it would mean nothing. */}
        <ellipse cx="31" cy="55" rx="5" ry="3" fill="#FF5C74" opacity="0.28" />
        <ellipse cx="69" cy="55" rx="5" ry="3" fill="#FF5C74" opacity="0.28" />
      </g>
    );
  }

  if (expression === 'SUSPICIOUS') {
    return (
      <g>
        <Eyes pupil={PUPIL} offsetX={2} />
        {/* Lids dropped over the top third. Suspicion is in the eyelid. */}
        <path d="M32 42h16v6H32ZM52 42h16v6H52Z" fill="#241F2B" opacity="0.001" />
        <g stroke={PUPIL} strokeWidth="3" strokeLinecap="round">
          <path d="M33 43l14 2M67 43l-14 2" />
        </g>
        <path d="M45 59h10" stroke={PUPIL} strokeWidth="2.5" strokeLinecap="round" />
      </g>
    );
  }

  if (expression === 'SURPRISED') {
    return (
      <g>
        <Eyes pupil={PUPIL} wide />
        <g stroke={PUPIL} strokeWidth="2.5" strokeLinecap="round">
          <path d="M33 36l13-3M67 36l-13-3" />
        </g>
        <ellipse cx="50" cy="60" rx="4" ry="5" fill={PUPIL} />
      </g>
    );
  }

  if (expression === 'SCARED') {
    return (
      <g>
        <Eyes pupil={PUPIL} wide />
        <g stroke={PUPIL} strokeWidth="2.5" strokeLinecap="round">
          <path d="M34 34l12 1M66 34l-12 1" />
        </g>
        {/* A wavy mouth. The one line that separates fear from surprise. */}
        <path
          d="M43 60q3-3 5 0t5 0t4 0"
          fill="none"
          stroke={PUPIL}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </g>
    );
  }

  return (
    <g>
      <Eyes pupil={PUPIL} />
      <g stroke={PUPIL} strokeWidth="2.5" strokeLinecap="round" opacity="0.75">
        <path d="M34 37h11M55 37h11" />
      </g>
      <path d="M45 58q5 4 10 0" fill="none" stroke={PUPIL} strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

function Eyes({ pupil, wide = false, offsetX = 0 }: { pupil: string; wide?: boolean; offsetX?: number }) {
  const ry = wide ? 9 : 7.5;
  return (
    <g>
      <ellipse cx="40" cy="48" rx="6.5" ry={ry} fill="#FFFFFF" />
      <ellipse cx="60" cy="48" rx="6.5" ry={ry} fill="#FFFFFF" />
      <circle cx={40 + offsetX} cy="49" r={wide ? 3 : 3.6} fill={pupil} />
      <circle cx={60 + offsetX} cy="49" r={wide ? 3 : 3.6} fill={pupil} />
      {/* One catchlight each. Without it the eyes read as buttons. */}
      <circle cx="38" cy="46" r="1.5" fill="#FFFFFF" />
      <circle cx="58" cy="46" r="1.5" fill="#FFFFFF" />
    </g>
  );
}
