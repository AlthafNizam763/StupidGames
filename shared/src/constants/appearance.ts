/**
 * Character appearance.
 *
 * Every player is a stylised human assembled from slots. The roster below is
 * the contract: the client renders these ids, the server validates against
 * them, and a value outside the roster is refused - exactly as avatars are, and
 * for the same reason. A free-text slot id would be a way to make every other
 * player's client render something the attacker chose.
 *
 * SECURITY NOTE, and it runs the opposite way to most of this codebase:
 * appearance is deliberately **public**. It travels on `PublicUser`,
 * `LobbyPlayer` and `PublicPlayerState` - the broadcast payloads - and must
 * never move to `SelfPlayerState`. A Saboteur has to be drawn by every other
 * client exactly as an Operator is. If appearance were private, the Saboteur
 * would be the one player nobody else could draw, and the game would be over
 * before it started.
 *
 * Roles are secret. Faces are not. Confusing the two in either direction breaks
 * something.
 */

export const BodyType = {
  BOY: 'BOY',
  GIRL: 'GIRL',
} as const;
export type BodyType = (typeof BodyType)[keyof typeof BodyType];

export const SKIN_TONES = [
  'skin-01',
  'skin-02',
  'skin-03',
  'skin-04',
  'skin-05',
  'skin-06',
] as const;

export const HAIR_STYLES = [
  'hair-short',
  'hair-buzz',
  'hair-bob',
  'hair-ponytail',
  'hair-curls',
  'hair-braids',
  'hair-bun',
  'hair-mohawk',
] as const;

export const HAIR_COLOURS = [
  'hairc-black',
  'hairc-brown',
  'hairc-blonde',
  'hairc-auburn',
  'hairc-grey',
  'hairc-teal',
  'hairc-violet',
] as const;

export const OUTFITS = [
  'outfit-jumpsuit',
  'outfit-engineer',
  'outfit-medic',
  'outfit-science',
  'outfit-cargo',
  'outfit-command',
] as const;

export const SHOES = ['shoes-boots', 'shoes-mag', 'shoes-trainers', 'shoes-deck'] as const;

export const ACCESSORIES = [
  'acc-goggles',
  'acc-headset',
  'acc-visor',
  'acc-scarf',
  'acc-badge',
] as const;

export const BACKPACKS = ['pack-standard', 'pack-tool', 'pack-oxygen', 'pack-science'] as const;

export type SkinTone = (typeof SKIN_TONES)[number];
export type HairStyle = (typeof HAIR_STYLES)[number];
export type HairColour = (typeof HAIR_COLOURS)[number];
export type Outfit = (typeof OUTFITS)[number];
export type Shoes = (typeof SHOES)[number];
export type Accessory = (typeof ACCESSORIES)[number];
export type Backpack = (typeof BACKPACKS)[number];

/**
 * A complete character.
 *
 * Accessory and backpack are nullable because "nothing" is a valid choice for
 * both, and an empty-string sentinel would be a value the roster has to carry
 * and every renderer has to special-case.
 */
export interface CharacterAppearance {
  body: BodyType;
  skin: SkinTone;
  hair: HairStyle;
  hairColour: HairColour;
  outfit: Outfit;
  shoes: Shoes;
  accessory: Accessory | null;
  backpack: Backpack | null;
}

export const DEFAULT_APPEARANCE: CharacterAppearance = {
  body: BodyType.BOY,
  skin: 'skin-03',
  hair: 'hair-short',
  hairColour: 'hairc-brown',
  outfit: 'outfit-jumpsuit',
  shoes: 'shoes-boots',
  accessory: null,
  backpack: 'pack-standard',
};

function inRoster<T extends string>(roster: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (roster as readonly string[]).includes(value);
}

/** Validates a complete appearance. Used by the server before storing one. */
export function isCharacterAppearance(value: unknown): value is CharacterAppearance {
  if (typeof value !== 'object' || value === null) return false;
  const a = value as Partial<CharacterAppearance>;

  return (
    (a.body === BodyType.BOY || a.body === BodyType.GIRL) &&
    inRoster(SKIN_TONES, a.skin) &&
    inRoster(HAIR_STYLES, a.hair) &&
    inRoster(HAIR_COLOURS, a.hairColour) &&
    inRoster(OUTFITS, a.outfit) &&
    inRoster(SHOES, a.shoes) &&
    (a.accessory === null || inRoster(ACCESSORIES, a.accessory)) &&
    (a.backpack === null || inRoster(BACKPACKS, a.backpack))
  );
}

/**
 * Repairs an appearance, slot by slot.
 *
 * Used when reading a stored value that predates a roster change, so retiring
 * one hair style does not leave existing players unrenderable. Each bad slot
 * falls back independently rather than discarding the whole character.
 */
export function coerceAppearance(value: unknown): CharacterAppearance {
  const a = (typeof value === 'object' && value !== null ? value : {}) as Partial<CharacterAppearance>;

  return {
    body: a.body === BodyType.GIRL ? BodyType.GIRL : BodyType.BOY,
    skin: inRoster(SKIN_TONES, a.skin) ? a.skin : DEFAULT_APPEARANCE.skin,
    hair: inRoster(HAIR_STYLES, a.hair) ? a.hair : DEFAULT_APPEARANCE.hair,
    hairColour: inRoster(HAIR_COLOURS, a.hairColour) ? a.hairColour : DEFAULT_APPEARANCE.hairColour,
    outfit: inRoster(OUTFITS, a.outfit) ? a.outfit : DEFAULT_APPEARANCE.outfit,
    shoes: inRoster(SHOES, a.shoes) ? a.shoes : DEFAULT_APPEARANCE.shoes,
    accessory: a.accessory === null || a.accessory === undefined
      ? null
      : inRoster(ACCESSORIES, a.accessory)
        ? a.accessory
        : null,
    backpack: a.backpack === null || a.backpack === undefined
      ? null
      : inRoster(BACKPACKS, a.backpack)
        ? a.backpack
        : null,
  };
}

/**
 * A varied starting character, derived from a stable seed.
 *
 * New accounts get something other than the default rather than a station full
 * of identical crew. Deterministic so the same account always starts the same
 * way, and only ever used to pick an *initial* value - once stored, the
 * player's own choices are what matter.
 */
export function deriveAppearance(seed: string): CharacterAppearance {
  // FNV-1a. Not for security - only to spread a string across the rosters.
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  const pick = <T>(roster: readonly T[], salt: number): T => {
    const mixed = (hash ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
    return roster[mixed % roster.length]!;
  };

  return {
    body: (hash & 1) === 0 ? BodyType.BOY : BodyType.GIRL,
    skin: pick(SKIN_TONES, 1),
    hair: pick(HAIR_STYLES, 2),
    hairColour: pick(HAIR_COLOURS, 3),
    outfit: pick(OUTFITS, 4),
    shoes: pick(SHOES, 5),
    accessory: (hash >>> 8) % 3 === 0 ? null : pick(ACCESSORIES, 6),
    backpack: (hash >>> 16) % 4 === 0 ? null : pick(BACKPACKS, 7),
  };
}
