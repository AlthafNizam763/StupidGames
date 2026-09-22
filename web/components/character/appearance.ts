import { AVATAR_COLOURS, DEFAULT_AVATAR_ID, isAvatarId } from '@voidline/shared';

/**
 * The modular character appearance model.
 *
 * A character is not a picture, it is a set of slots. The renderer draws
 * whatever each slot names, so adding a hairstyle is a new entry in a table
 * rather than a new copy of the whole character - and a cosmetic can be
 * changed without touching anything else about the player.
 *
 *   Character
 *    ├── body      (BOY | GIRL)
 *    ├── skin
 *    ├── hair + hairColour
 *    ├── outfit
 *    ├── shoes
 *    ├── accessory (optional)
 *    └── backpack  (optional)
 *
 * SECRECY: nothing in this file knows about roles, and it must stay that way.
 * Appearance is public information - every client draws every player from the
 * same data - so if the Cat's appearance were derived from their role, the
 * whole game would be over on the first frame. The Cat artwork lives in
 * `CatCharacter`, which is only ever mounted on its owner's own screen.
 */

/* -------------------------------------------------------------- body - */

export const BodyType = {
  BOY: 'BOY',
  GIRL: 'GIRL',
} as const;
export type BodyType = (typeof BodyType)[keyof typeof BodyType];

export const ALL_BODY_TYPES: readonly BodyType[] = [BodyType.BOY, BodyType.GIRL];

export const BODY_LABELS: Readonly<Record<BodyType, string>> = {
  BOY: 'Boy',
  GIRL: 'Girl',
};

/* -------------------------------------------------------------- skin - */

/**
 * Skin tones.
 *
 * Six, spread across the range rather than clustered at the light end, because
 * a roster where every option is a shade of the same thing is not a choice.
 * Each carries its own shadow value: a single black overlay at low opacity
 * goes grey and muddy on deeper tones.
 */
export interface SkinTone {
  id: string;
  label: string;
  base: string;
  shadow: string;
}

export const SKIN_TONES: readonly SkinTone[] = [
  { id: 'skin-01', label: 'Porcelain', base: '#F8DCC8', shadow: '#E4BDA3' },
  { id: 'skin-02', label: 'Sand', base: '#EFC49C', shadow: '#D4A277' },
  { id: 'skin-03', label: 'Honey', base: '#D69A6A', shadow: '#B87B4E' },
  { id: 'skin-04', label: 'Bronze', base: '#B2703F', shadow: '#8E552D' },
  { id: 'skin-05', label: 'Umber', base: '#84502C', shadow: '#653A1D' },
  { id: 'skin-06', label: 'Ebony', base: '#59341C', shadow: '#412411' },
];

export type SkinToneId = string;

/* -------------------------------------------------------------- hair - */

/**
 * Hairstyles.
 *
 * Chosen for silhouette rather than detail. A character is read at 28px in a
 * lobby row and at roughly 40px on the map, where interior line work is
 * invisible and only the outline survives - so every style here differs in
 * outline, not in texture.
 */
export const HAIR_STYLES = [
  { id: 'hair-crop', label: 'Crop' },
  { id: 'hair-swept', label: 'Swept' },
  { id: 'hair-curls', label: 'Curls' },
  { id: 'hair-bob', label: 'Bob' },
  { id: 'hair-ponytail', label: 'Ponytail' },
  { id: 'hair-buns', label: 'Buns' },
  { id: 'hair-long', label: 'Long' },
  { id: 'hair-undercut', label: 'Undercut' },
] as const;

export type HairId = (typeof HAIR_STYLES)[number]['id'];

export const HAIR_COLOURS = [
  { id: 'hc-ink', label: 'Ink', base: '#241F2B', shine: '#3D3547' },
  { id: 'hc-espresso', label: 'Espresso', base: '#4A2E1E', shine: '#6B452E' },
  { id: 'hc-chestnut', label: 'Chestnut', base: '#7A4A24', shine: '#9E6634' },
  { id: 'hc-wheat', label: 'Wheat', base: '#D4A24C', shine: '#EFC272' },
  { id: 'hc-rust', label: 'Rust', base: '#B4552C', shine: '#D4703F' },
  { id: 'hc-ash', label: 'Ash', base: '#9AA3B2', shine: '#C2C9D4' },
  { id: 'hc-signal', label: 'Signal', base: '#2BB397', shine: '#3FE0BC' },
  { id: 'hc-orchid', label: 'Orchid', base: '#8A5AD6', shine: '#B583FF' },
] as const;

export type HairColourId = (typeof HAIR_COLOURS)[number]['id'];

/* ------------------------------------------------------------ outfit - */

/**
 * Outfits.
 *
 * The *cut* is the cosmetic; the *colour* is not. Colour comes from the
 * player's avatar preset, which the server validates and every client already
 * shares, so two players are never hard to tell apart on the map because one
 * of them picked the same shade as the other.
 */
export const OUTFITS = [
  { id: 'fit-jumpsuit', label: 'Jumpsuit' },
  { id: 'fit-jacket', label: 'Flight Jacket' },
  { id: 'fit-hoodie', label: 'Hoodie' },
  { id: 'fit-vest', label: 'Utility Vest' },
  { id: 'fit-dungarees', label: 'Dungarees' },
  { id: 'fit-skirt', label: 'Field Skirt' },
] as const;

export type OutfitId = (typeof OUTFITS)[number]['id'];

export const SHOES = [
  { id: 'shoe-boots', label: 'Deck Boots', colour: '#2B3446' },
  { id: 'shoe-trainers', label: 'Trainers', colour: '#E8EDF7' },
  { id: 'shoe-mag', label: 'Mag Grips', colour: '#4A5468' },
  { id: 'shoe-hitop', label: 'Hi-Tops', colour: '#B4552C' },
] as const;

export type ShoesId = (typeof SHOES)[number]['id'];

/* -------------------------------------------------------- accessories - */

export const ACCESSORIES = [
  { id: 'acc-cap', label: 'Crew Cap' },
  { id: 'acc-glasses', label: 'Glasses' },
  { id: 'acc-visor', label: 'Visor' },
  { id: 'acc-headphones', label: 'Headphones' },
  { id: 'acc-scarf', label: 'Scarf' },
  /* A wink at the thing nobody is supposed to know about. Available to
   * everyone, precisely so that wearing it means nothing (§BG). */
  { id: 'acc-cat-ears', label: 'Cat Ears' },
] as const;

export type AccessoryId = (typeof ACCESSORIES)[number]['id'];

export const BACKPACKS = [
  { id: 'bag-pack', label: 'Field Pack' },
  { id: 'bag-tank', label: 'Air Tank' },
  { id: 'bag-satchel', label: 'Satchel' },
] as const;

export type BackpackId = (typeof BACKPACKS)[number]['id'];

/* -------------------------------------------------------- appearance - */

export interface CharacterAppearance {
  body: BodyType;
  skin: SkinToneId;
  hair: HairId;
  hairColour: HairColourId;
  outfit: OutfitId;
  shoes: ShoesId;
  /** Null means none. Not every slot is filled. */
  accessory: AccessoryId | null;
  backpack: BackpackId | null;
}

export const DEFAULT_APPEARANCE: CharacterAppearance = {
  body: BodyType.BOY,
  skin: 'skin-02',
  hair: 'hair-crop',
  hairColour: 'hc-espresso',
  outfit: 'fit-jumpsuit',
  shoes: 'shoe-boots',
  accessory: null,
  backpack: null,
};

/* ------------------------------------------------------------ lookups - */

export function skinTone(id: SkinToneId): SkinTone {
  return SKIN_TONES.find((tone) => tone.id === id) ?? (SKIN_TONES[0] as SkinTone);
}

export function hairColour(id: HairColourId): (typeof HAIR_COLOURS)[number] {
  return HAIR_COLOURS.find((colour) => colour.id === id) ?? HAIR_COLOURS[0];
}

export function shoeColour(id: ShoesId): string {
  return (SHOES.find((shoe) => shoe.id === id) ?? SHOES[0]).colour;
}

/** The uniform colour for an avatar preset. Falls back rather than rendering nothing. */
export function uniformColour(avatarId: string): string {
  return AVATAR_COLOURS[isAvatarId(avatarId) ? avatarId : DEFAULT_AVATAR_ID];
}

/* ------------------------------------------------------------ derived - */

/**
 * A stable appearance for a player who has not customised one.
 *
 * Derived from their user id, so it is the *same* on every client - which is
 * what stops one player seeing a character with short dark hair where everyone
 * else sees long red hair. In a game where "the one with the ponytail went
 * into Reactor" is evidence, two clients disagreeing about a hairstyle is a
 * correctness bug, not a cosmetic one.
 *
 * Deterministic, not random: the same id always produces the same character,
 * across reloads and across devices.
 */
export function derivedAppearance(userId: string, avatarId: string): CharacterAppearance {
  const seed = hash(`${userId}:${avatarId}`);

  const pick = <T>(list: readonly T[], salt: number): T =>
    list[(seed >>> salt) % list.length] as T;

  const body = (seed & 1) === 0 ? BodyType.BOY : BodyType.GIRL;

  return {
    body,
    skin: pick(SKIN_TONES, 2).id,
    hair: pick(HAIR_STYLES, 5).id,
    hairColour: pick(HAIR_COLOURS, 9).id,
    outfit: pick(OUTFITS, 13).id,
    shoes: pick(SHOES, 17).id,
    // Most players have no accessory, so the ones who do stand out.
    accessory: (seed >>> 20) % 3 === 0 ? pick(ACCESSORIES, 21).id : null,
    backpack: (seed >>> 24) % 4 === 0 ? pick(BACKPACKS, 25).id : null,
  };
}

/** FNV-1a. Small, fast, and stable across engines - which `Math.random` is not. */
function hash(input: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}
