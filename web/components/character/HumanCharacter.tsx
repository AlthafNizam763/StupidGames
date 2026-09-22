import type { CharacterAppearance } from '@voidline/shared';
import { cn } from '@/lib/cn';
import {
  BodyType,
  hairPaint,
  OUTLINE,
  outfitPaint,
  shoePaint,
  skinPaint,
  TROUSER_COLOUR,
  uniformColour,
  type HairPaint,
  type SkinPaint,
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
 * is the private role reveal and that player's own HUD.
 *
 * Original artwork for this project. Inline SVG rather than sprite sheets
 * because the character is modular: eight hairstyles times six outfits times
 * six skin tones times seven hair colours times eight uniform colours is not a
 * set of files anybody can keep in sync, but it is a few dozen paths and a
 * palette.
 *
 * PROPORTIONS: the head is deliberately about a third of the total height.
 * Chibi proportions survive being drawn 40px tall on a phone, where a
 * realistically proportioned head is nine pixels and every expression in the
 * game is lost.
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
  /** Adds the idle breathing loop. Off inside lists, where fifteen would churn. */
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
  const skin = skinPaint(appearance.skin);
  const hair = hairPaint(appearance.hairColour);
  const uniform = uniformColour(avatarId);
  const outfit = outfitPaint(appearance.outfit);
  const soles = shoePaint(appearance.shoes).colour;
  const girl = appearance.body === BodyType.GIRL;
  const shoulder = girl ? 33 : 30;

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
       * from the body is how a character starts to look like a puppet with a
       * loose neck.
       */}
      <g
        className={cn(animated && 'animate-character-idle')}
        style={{ transformOrigin: '50px 130px' }}
      >
        <Backpack appearance={appearance} uniform={uniform} />
        <BackHair appearance={appearance} hair={hair} />

        {/*
         * The body is outlined as one group.
         *
         * Two problems disappear at once. An arm the same colour as the torso
         * stops merging into it, and the whole figure stops dissolving into
         * the background - and every background in this game is dark. Shapes
         * that set their own `stroke` keep it; the rest inherit this.
         */}
        <g stroke={OUTLINE} strokeWidth="1.5" strokeLinejoin="round">
          <Legs appearance={appearance} skin={skin} soles={soles} pose={pose} girl={girl} />
          <Torso
            appearance={appearance}
            uniform={uniform}
            trim={outfit.trim}
            skin={skin}
            shoulder={shoulder}
          />
          <Arms
            uniform={uniform}
            skin={skin}
            pose={pose}
            shoulder={shoulder}
            appearance={appearance}
          />
          <Head skin={skin} />
        </g>
        <Face expression={expression} />
        <FrontHair appearance={appearance} hair={hair} />
        <Accessory appearance={appearance} uniform={uniform} />
      </g>
    </svg>
  );
}

/* =========================================================== body parts = */

function Head({ skin }: { skin: SkinPaint }) {
  return (
    <g>
      {/* Neck, behind the jaw so the join never shows. */}
      <rect x="44" y="62" width="12" height="14" rx="5" fill={skin.shadow} />
      <ellipse cx="50" cy="44" rx="27" ry="26" fill={skin.base} />
      {/* One shadow under the jaw. Enough to read as round; no gradients. */}
      <path d="M26 52a27 26 0 0 0 48 0 27 26 0 0 1-48 0Z" fill={skin.shadow} opacity="0.45" />
      {/* Ears. Small, but they hold the silhouette together at the sides. */}
      <ellipse cx="23.5" cy="47" rx="4" ry="5.5" fill={skin.base} />
      <ellipse cx="76.5" cy="47" rx="4" ry="5.5" fill={skin.base} />
    </g>
  );
}

/**
 * The six station uniforms.
 *
 * Each differs in outline, not in pattern: a lab coat that falls past the hip,
 * a vest with pouches on the flanks, a medic with short sleeves. Detail inside
 * the outline is gone by the time the character is 40px tall on the map, and
 * on the map is where telling two crew apart actually matters.
 */
function Torso({
  appearance,
  uniform,
  trim,
  skin,
  shoulder,
}: {
  appearance: CharacterAppearance;
  uniform: string;
  trim: string;
  skin: SkinPaint;
  shoulder: number;
}) {
  const width = 100 - shoulder * 2;

  switch (appearance.outfit) {
    case 'outfit-engineer':
      return (
        <g>
          <rect x={shoulder} y="76" width={width} height="32" rx="7" fill={uniform} />
          {/* Hi-vis band across the chest, and padded shoulders. */}
          <rect x={shoulder} y="88" width={width} height="6" fill={trim} opacity="0.9" />
          <rect x={shoulder - 3} y="76" width="9" height="9" rx="4" fill={trim} opacity="0.75" />
          <rect x={100 - shoulder - 6} y="76" width="9" height="9" rx="4" fill={trim} opacity="0.75" />
          <rect x={shoulder} y="100" width={width} height="4" fill="#00000033" />
        </g>
      );

    case 'outfit-medic':
      return (
        <g>
          <rect x={shoulder} y="76" width={width} height="32" rx="7" fill={trim} />
          {/* Uniform colour kept as a yoke, so the player is still identifiable. */}
          <path d={`M${shoulder} 83v-1c0-3.5 3-6 6-6h${width - 12}c3 0 6 2.5 6 6v1Z`} fill={uniform} />
          <rect x="47" y="86" width="6" height="16" rx="1" fill={uniform} />
          <rect x="42" y="91" width="16" height="6" rx="1" fill={uniform} />
        </g>
      );

    case 'outfit-science':
      return (
        <g>
          <rect x={shoulder + 3} y="76" width={width - 6} height="30" rx="6" fill={uniform} />
          {/* The coat: two panels falling past the hip. The longest silhouette. */}
          <path d={`M${shoulder - 3} 78h13v40h-13Z`} fill={trim} opacity="0.92" />
          <path d={`M${100 - shoulder - 10} 78h13v40h-13Z`} fill={trim} opacity="0.92" />
          <path d={`M${shoulder - 3} 78 50 88l${width + 6 - 10} -10`} stroke="#00000026" strokeWidth="2" fill="none" />
        </g>
      );

    case 'outfit-cargo':
      return (
        <g>
          {/* Bare arms: the vest leaves the shoulders out, which is the read. */}
          <rect x={shoulder + 1} y="76" width={width - 2} height="32" rx="7" fill={skin.shadow} />
          <rect x={shoulder} y="82" width={width} height="26" rx="5" fill={uniform} />
          <rect x={shoulder - 4} y="90" width="8" height="11" rx="2.5" fill={trim} opacity="0.8" />
          <rect x={100 - shoulder - 4} y="90" width="8" height="11" rx="2.5" fill={trim} opacity="0.8" />
          <rect x="47" y="82" width="6" height="26" fill="#00000030" />
        </g>
      );

    case 'outfit-command':
      return (
        <g>
          <rect x={shoulder} y="76" width={width} height="32" rx="7" fill={uniform} />
          {/* Standing collar and two rank bars. */}
          <path d="M43 76 50 85 57 76Z" fill="#00000045" />
          <rect x={shoulder + 2} y="79" width="8" height="2.5" rx="1" fill={trim} />
          <rect x={shoulder + 2} y="83" width="8" height="2.5" rx="1" fill={trim} />
          <rect x="49" y="85" width="2" height="23" fill="#00000038" />
          <rect x={shoulder} y="100" width={width} height="4" fill={trim} opacity="0.55" />
        </g>
      );

    case 'outfit-jumpsuit':
    default:
      return (
        <g>
          <rect x={shoulder} y="76" width={width} height="32" rx="7" fill={uniform} />
          <path
            d={`M${shoulder + 6} 76 50 84l${width / 2 - 6} -8`}
            stroke="#00000033"
            strokeWidth="2"
            fill="none"
          />
          <rect x={shoulder} y="97" width={width} height="5" fill={trim} opacity="0.5" />
        </g>
      );
  }
}

function Arms({
  uniform,
  skin,
  pose,
  shoulder,
  appearance,
}: {
  uniform: string;
  skin: SkinPaint;
  pose: Pose;
  shoulder: number;
  appearance: CharacterAppearance;
}) {
  // Two uniforms leave the arms bare. Painting a sleeve over them would undo
  // the only thing that distinguishes those silhouettes.
  const sleeve =
    appearance.outfit === 'outfit-cargo' || appearance.outfit === 'outfit-medic'
      ? skin.base
      : uniform;

  if (pose === 'CHEER') {
    return (
      <g>
        <g transform="rotate(-42 34 84)">
          <rect x={shoulder - 7} y="78" width="8" height="26" rx="4" fill={sleeve} />
          <circle cx={shoulder - 3} cy="104" r="5" fill={skin.base} />
        </g>
        <g transform="rotate(42 66 84)">
          <rect x={100 - shoulder - 1} y="78" width="8" height="26" rx="4" fill={sleeve} />
          <circle cx={100 - shoulder + 3} cy="104" r="5" fill={skin.base} />
        </g>
      </g>
    );
  }

  const droop = pose === 'SLUMP' ? 6 : 0;

  return (
    <g>
      <rect x={shoulder - 7} y={78 + droop} width="8" height="24" rx="4" fill={sleeve} />
      <circle cx={shoulder - 3} cy={103 + droop} r="5" fill={skin.base} />
      <rect x={100 - shoulder - 1} y={78 + droop} width="8" height="24" rx="4" fill={sleeve} />
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
  skin: SkinPaint;
  soles: string;
  pose: Pose;
  girl: boolean;
}) {
  // Walk offsets one leg forward and the other back. Two frames read as
  // walking at this scale; four cost more and read the same.
  const lift = pose === 'WALK' ? 3 : 0;
  // Bare legs under the medic's short uniform; trousers under everything else.
  const trouser = appearance.outfit === 'outfit-medic' ? skin.shadow : TROUSER_COLOUR;

  return (
    <g>
      <g transform={`translate(0 ${-lift})`}>
        <rect x={girl ? 40 : 39} y="103" width="10" height="21" rx="5" fill={trouser} />
        <rect x={girl ? 36 : 35} y="120" width="16" height="10" rx="5" fill={soles} />
      </g>
      <g transform={`translate(0 ${lift})`}>
        <rect x={girl ? 50 : 51} y="103" width="10" height="21" rx="5" fill={trouser} />
        <rect x={girl ? 48 : 49} y="120" width="16" height="10" rx="5" fill={soles} />
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
  hair: HairPaint;
}) {
  switch (appearance.hair) {
    case 'hair-bob':
      return <path d="M22 42c-3 14-2 22 0 28h56c2-6 3-14 0-28Z" fill={hair.base} />;

    case 'hair-braids':
      return <path d="M22 44c-3 18-2 28 0 34h56c2-6 3-16 0-34Z" fill={hair.base} />;

    case 'hair-ponytail':
      return (
        <g>
          <path
            d="M70 34c10 4 16 14 15 26-1 10-6 18-12 22l-8-5c6-4 10-11 10-19s-3-15-9-19Z"
            fill={hair.base}
          />
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
  hair: HairPaint;
}) {
  /*
   * Every style is built from one arc across the top of the head, with a
   * different hairline drawn back across it. Sharing the arc is what keeps
   * eight hairstyles sitting on the same skull instead of eight slightly
   * different ones.
   */
  const cap = (hairline: string) => `M23 44A27 26 0 0 1 77 44 ${hairline} Z`;

  switch (appearance.hair) {
    case 'hair-buzz':
      return (
        <g>
          {/* Cropped to the skull: the hairline sits high and the sides vanish. */}
          <path d="M27 40A24 23 0 0 1 73 40C68 29 32 29 27 40Z" fill={hair.base} />
          <path d="M31 34c6-6 32-6 38 0-8-4-30-4-38 0Z" fill={hair.shine} opacity="0.7" />
        </g>
      );

    case 'hair-mohawk':
      return (
        <g>
          {/* Shaved sides, one tall strip. Pure silhouette, no interior detail. */}
          <path d="M28 42A23 22 0 0 1 72 42C66 34 34 34 28 42Z" fill={hair.base} opacity="0.35" />
          <path d="M42 34c0-16 4-24 8-26 4 2 8 10 8 26Z" fill={hair.base} />
          <path d="M47 30c0-11 1-17 3-19 2 2 3 8 3 19Z" fill={hair.shine} />
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

    case 'hair-braids':
      return (
        <g>
          <path d={cap('C75 29 58 26 50 30 C42 26 25 29 23 44')} fill={hair.base} />
          {/* Two braids: a stack of beads reads as plaiting at any size. */}
          {[0, 1].map((side) => {
            const x = side === 0 ? 24 : 76;
            return (
              <g key={side}>
                {[56, 64, 72, 80].map((y, i) => (
                  <ellipse key={y} cx={x} cy={y} rx={6 - i * 0.6} ry="5" fill={hair.base} />
                ))}
                <ellipse cx={x} cy="86" rx="3" ry="3" fill={hair.shine} />
              </g>
            );
          })}
          <path d="M34 29c8-5 26-5 34 0-10-2-24-2-34 0Z" fill={hair.shine} />
        </g>
      );

    case 'hair-ponytail':
      return (
        <g>
          <path d={cap('C75 29 58 26 50 30 C42 26 25 29 23 44')} fill={hair.base} />
          <path d="M30 31c8-7 32-7 40 0-12-4-28-4-40 0Z" fill={hair.shine} />
        </g>
      );

    case 'hair-bun':
      return (
        <g>
          <path d={cap('C75 29 58 26 50 30 C42 26 25 29 23 44')} fill={hair.base} />
          {/* One bun, high and centred. */}
          <circle cx="50" cy="16" r="11" fill={hair.base} />
          <circle cx="46" cy="12" r="4" fill={hair.shine} />
          <rect x="42" y="22" width="16" height="5" rx="2.5" fill={hair.shine} opacity="0.6" />
        </g>
      );

    case 'hair-short':
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
  uniform,
}: {
  appearance: CharacterAppearance;
  uniform: string;
}) {
  switch (appearance.accessory) {
    case 'acc-goggles':
      return (
        <g>
          {/* Pushed up onto the forehead, so they never cover the eyes. */}
          <path d="M22 34h56" stroke="#2B3446" strokeWidth="6" strokeLinecap="round" />
          <rect x="30" y="28" width="16" height="11" rx="4" fill="#0A0E16" />
          <rect x="54" y="28" width="16" height="11" rx="4" fill="#0A0E16" />
          <rect x="33" y="30" width="6" height="3" rx="1.5" fill="#6FA8FF" opacity="0.65" />
        </g>
      );

    case 'acc-headset':
      return (
        <g>
          <path
            d="M22 46a28 26 0 0 1 56 0"
            stroke="#2B3446"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
          />
          <rect x="16" y="42" width="11" height="16" rx="5" fill="#2B3446" />
          <rect x="73" y="42" width="11" height="16" rx="5" fill="#2B3446" />
          <rect x="19" y="46" width="5" height="8" rx="2.5" fill="#3FE0BC" opacity="0.6" />
          {/* Mic boom. The detail that says headset rather than headphones. */}
          <path d="M27 54c-4 6-4 10 2 12" stroke="#2B3446" strokeWidth="3" fill="none" strokeLinecap="round" />
          <circle cx="30" cy="66" r="2.5" fill="#2B3446" />
        </g>
      );

    case 'acc-visor':
      return (
        <g>
          <rect x="24" y="40" width="52" height="14" rx="7" fill="#0A0E16" opacity="0.88" />
          <rect x="28" y="43" width="18" height="4" rx="2" fill="#3FE0BC" opacity="0.5" />
        </g>
      );

    case 'acc-scarf':
      return (
        <g>
          <rect x="34" y="68" width="32" height="9" rx="4.5" fill="#FF5C74" />
          <path d="M60 74l7 16-9-3Z" fill="#D63F56" />
        </g>
      );

    case 'acc-badge':
      return (
        <g>
          <circle cx="63" cy="90" r="5" fill="#FFC15E" />
          <circle cx="63" cy="90" r="2" fill={uniform} />
        </g>
      );

    default:
      return null;
  }
}

function Backpack({
  appearance,
  uniform,
}: {
  appearance: CharacterAppearance;
  uniform: string;
}) {
  switch (appearance.backpack) {
    case 'pack-standard':
      return (
        <g>
          <rect x="24" y="76" width="52" height="28" rx="8" fill="#00000055" />
          <rect x="30" y="82" width="40" height="8" rx="3" fill={uniform} opacity="0.5" />
        </g>
      );

    case 'pack-tool':
      return (
        <g>
          <rect x="24" y="78" width="52" height="26" rx="7" fill="#00000055" />
          {/* Handles over the shoulder line. */}
          <rect x="28" y="66" width="5" height="16" rx="2.5" fill="#FFC15E" />
          <rect x="36" y="62" width="5" height="20" rx="2.5" fill="#9AA3B2" />
        </g>
      );

    case 'pack-oxygen':
      return (
        <g>
          <rect x="28" y="72" width="14" height="34" rx="7" fill="#4A5468" />
          <rect x="58" y="72" width="14" height="34" rx="7" fill="#4A5468" />
          <rect x="31" y="76" width="8" height="4" rx="2" fill="#E8EDF7" opacity="0.4" />
          <rect x="61" y="76" width="8" height="4" rx="2" fill="#E8EDF7" opacity="0.4" />
        </g>
      );

    case 'pack-science':
      return (
        <g>
          {/* Boxy, hard-edged: the one pack with corners. */}
          <rect x="26" y="78" width="48" height="26" rx="3" fill="#00000055" />
          <rect x="26" y="88" width="48" height="3" fill="#6FA8FF" opacity="0.6" />
        </g>
      );

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
 * glitch rather than as a feeling.
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
        <path
          d="M43 57c3 5 11 5 14 0"
          fill="none"
          stroke={PUPIL}
          strokeWidth="2.5"
          strokeLinecap="round"
        />
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

function Eyes({
  pupil,
  wide = false,
  offsetX = 0,
}: {
  pupil: string;
  wide?: boolean;
  offsetX?: number;
}) {
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
