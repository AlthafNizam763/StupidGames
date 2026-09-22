import {
  ACCESSORIES,
  AVATAR_COLOURS,
  BACKPACKS,
  BodyType,
  DEFAULT_AVATAR_ID,
  HAIR_COLOURS,
  HAIR_STYLES,
  OUTFITS,
  SHOES,
  SKIN_TONES,
  isAvatarId,
  type Accessory,
  type Backpack,
  type HairColour,
  type HairStyle,
  type Outfit,
  type Shoes,
  type SkinTone,
} from '@voidline/shared';

/**
 * The art vocabulary.
 *
 * The *roster* - which slots exist and which ids are legal - is the shared
 * contract, because the server validates against it. What a given id looks
 * like is not: the server has no opinion about what colour `hairc-auburn` is,
 * and should not have one.
 *
 * So this module holds exactly the half the contract does not: palettes and
 * display names, keyed by the shared ids. Adding a hairstyle means a new id in
 * `shared/src/constants/appearance.ts` and a new case in `HumanCharacter`;
 * changing what auburn looks like means editing one hex value here and
 * nothing else.
 *
 * Every record below is keyed by the shared roster type, so retiring or adding
 * an id upstream is a compile error here rather than a character that renders
 * as undefined.
 */

export { BodyType };
export type {
  Accessory,
  Backpack,
  CharacterAppearance,
  HairColour,
  HairStyle,
  Outfit,
  Shoes,
  SkinTone,
} from '@voidline/shared';
export { DEFAULT_APPEARANCE, deriveAppearance } from '@voidline/shared';

/* ---------------------------------------------------------------- body - */

export const ALL_BODY_TYPES: readonly BodyType[] = [BodyType.BOY, BodyType.GIRL];

export const BODY_LABELS: Readonly<Record<BodyType, string>> = {
  BOY: 'Boy',
  GIRL: 'Girl',
};

/* ---------------------------------------------------------------- skin - */

export interface SkinPaint {
  label: string;
  base: string;
  /**
   * Its own shadow value rather than a black overlay.
   *
   * One translucent black across every tone goes grey and muddy on the deeper
   * ones - the shadow stops looking like shadow and starts looking like dirt.
   */
  shadow: string;
}

export const SKIN_PAINT: Readonly<Record<SkinTone, SkinPaint>> = {
  'skin-01': { label: 'Porcelain', base: '#F8DCC8', shadow: '#E4BDA3' },
  'skin-02': { label: 'Sand', base: '#EFC49C', shadow: '#D4A277' },
  'skin-03': { label: 'Honey', base: '#D69A6A', shadow: '#B87B4E' },
  'skin-04': { label: 'Bronze', base: '#B2703F', shadow: '#8E552D' },
  'skin-05': { label: 'Umber', base: '#84502C', shadow: '#653A1D' },
  'skin-06': { label: 'Ebony', base: '#59341C', shadow: '#412411' },
};

/* ---------------------------------------------------------------- hair - */

export interface HairPaint {
  label: string;
  base: string;
  /** The lit edge. One highlight, so hair reads as a mass rather than a decal. */
  shine: string;
}

export const HAIR_PAINT: Readonly<Record<HairColour, HairPaint>> = {
  'hairc-black': { label: 'Black', base: '#241F2B', shine: '#3D3547' },
  'hairc-brown': { label: 'Brown', base: '#4A2E1E', shine: '#6B452E' },
  'hairc-blonde': { label: 'Blonde', base: '#D4A24C', shine: '#EFC272' },
  'hairc-auburn': { label: 'Auburn', base: '#8E3F22', shine: '#B45A33' },
  'hairc-grey': { label: 'Ash', base: '#9AA3B2', shine: '#C2C9D4' },
  'hairc-teal': { label: 'Teal', base: '#2BB397', shine: '#3FE0BC' },
  'hairc-violet': { label: 'Violet', base: '#8A5AD6', shine: '#B583FF' },
};

export const HAIR_LABELS: Readonly<Record<HairStyle, string>> = {
  'hair-short': 'Short',
  'hair-buzz': 'Buzz',
  'hair-bob': 'Bob',
  'hair-ponytail': 'Ponytail',
  'hair-curls': 'Curls',
  'hair-braids': 'Braids',
  'hair-bun': 'Bun',
  'hair-mohawk': 'Mohawk',
};

/* -------------------------------------------------------------- outfit - */

/**
 * The six station uniforms.
 *
 * Each is a *cut*, not a colour. Colour comes from the player's avatar preset,
 * which is how players refer to each other out loud - "the teal one was in
 * Reactor" has to keep working, so a cosmetic may never override it.
 *
 * `trim` is the one secondary colour each uniform is allowed, for a collar or
 * a stripe. Fixed per uniform rather than per player, so it reads as issued
 * kit rather than as a second identity colour competing with the first.
 */
export interface OutfitPaint {
  label: string;
  trim: string;
}

export const OUTFIT_PAINT: Readonly<Record<Outfit, OutfitPaint>> = {
  'outfit-jumpsuit': { label: 'Jumpsuit', trim: '#2B3446' },
  'outfit-engineer': { label: 'Engineer', trim: '#FFC15E' },
  'outfit-medic': { label: 'Medic', trim: '#E8EDF7' },
  'outfit-science': { label: 'Science', trim: '#6FA8FF' },
  'outfit-cargo': { label: 'Cargo', trim: '#B4552C' },
  'outfit-command': { label: 'Command', trim: '#3FE0BC' },
};

/* --------------------------------------------------- shoes, extras, bags - */

export interface ShoePaint {
  label: string;
  colour: string;
}

/**
 * Footwear.
 *
 * Every value here clears the darkest surface it will ever sit on
 * (`--color-void-900`, #0a0e16) by a wide margin. The first version of this
 * table used #2B3446 for boots, which is a perfectly good navy and completely
 * invisible against the lobby background - the characters read as a head and
 * a torso floating above nothing. A character is drawn on dark surfaces
 * everywhere in this game, so no part of one may be dark.
 */
export const SHOE_PAINT: Readonly<Record<Shoes, ShoePaint>> = {
  'shoes-boots': { label: 'Deck Boots', colour: '#54617C' },
  'shoes-mag': { label: 'Mag Grips', colour: '#6E7B94' },
  'shoes-trainers': { label: 'Trainers', colour: '#E8EDF7' },
  'shoes-deck': { label: 'Deck Shoes', colour: '#A9773F' },
};

/** Trouser colour. Same rule as shoes: never darker than the surface behind it. */
export const TROUSER_COLOUR = '#3E4A63';

/**
 * The outline every character carries.
 *
 * A dark rim around each shape is what lets an arm read as separate from the
 * torso it is the same colour as, and what stops a character dissolving into
 * a dark background. It is the cheapest possible substitute for lighting.
 */
export const OUTLINE = '#0A0E16';

export const ACCESSORY_LABELS: Readonly<Record<Accessory, string>> = {
  'acc-goggles': 'Goggles',
  'acc-headset': 'Headset',
  'acc-visor': 'Visor',
  'acc-scarf': 'Scarf',
  'acc-badge': 'Badge',
};

export const BACKPACK_LABELS: Readonly<Record<Backpack, string>> = {
  'pack-standard': 'Field Pack',
  'pack-tool': 'Tool Rig',
  'pack-oxygen': 'Air Tank',
  'pack-science': 'Sample Case',
};

/* ------------------------------------------------------------- rosters - */

/**
 * The rosters again, as arrays, for building pickers.
 *
 * Re-exported from the contract rather than re-declared, so the customisation
 * screen cannot offer a slot the server would refuse.
 */
export const ROSTERS = {
  body: ALL_BODY_TYPES,
  skin: SKIN_TONES,
  hair: HAIR_STYLES,
  hairColour: HAIR_COLOURS,
  outfit: OUTFITS,
  shoes: SHOES,
  accessory: ACCESSORIES,
  backpack: BACKPACKS,
} as const;

/* ------------------------------------------------------------- lookups - */

export function skinPaint(id: SkinTone): SkinPaint {
  return SKIN_PAINT[id];
}

export function hairPaint(id: HairColour): HairPaint {
  return HAIR_PAINT[id];
}

export function outfitPaint(id: Outfit): OutfitPaint {
  return OUTFIT_PAINT[id];
}

export function shoePaint(id: Shoes): ShoePaint {
  return SHOE_PAINT[id];
}

/** The uniform colour for an avatar preset. Falls back rather than rendering nothing. */
export function uniformColour(avatarId: string): string {
  return AVATAR_COLOURS[isAvatarId(avatarId) ? avatarId : DEFAULT_AVATAR_ID];
}
