/**
 * The avatar roster.
 *
 * Avatars are preset ids, never client-supplied URLs or uploads. The server
 * validates a chosen id against this list, so a player cannot set their avatar
 * to an arbitrary remote image - which would otherwise be a way to make every
 * other player's browser fetch a URL the attacker controls.
 *
 * The artwork itself lives in the client, drawn from the id. Only the identity
 * of each avatar is part of the contract.
 */

export const AVATAR_IDS = [
  'operator-01',
  'operator-02',
  'operator-03',
  'operator-04',
  'operator-05',
  'operator-06',
  'operator-07',
  'operator-08',
] as const;

export type AvatarPresetId = (typeof AVATAR_IDS)[number];

export const DEFAULT_AVATAR_ID: AvatarPresetId = 'operator-01';

export function isAvatarId(value: unknown): value is AvatarPresetId {
  return typeof value === 'string' && (AVATAR_IDS as readonly string[]).includes(value);
}

/**
 * Suit colours, keyed by avatar id.
 *
 * Shared rather than client-only because the Canvas renderer (Phase 9) draws
 * players in these colours too, and a player's suit must look the same in the
 * lobby list as it does on the map.
 *
 * The eight are chosen to stay distinguishable from one another at a glance and
 * to remain separable under the common forms of colour blindness - in a game
 * where "who did you see in Reactor" decides a vote, two players who look alike
 * is a real problem, not a cosmetic one.
 */
export const AVATAR_COLOURS: Readonly<Record<AvatarPresetId, string>> = {
  'operator-01': '#3FE0BC', // teal
  'operator-02': '#FF5C74', // coral
  'operator-03': '#6FA8FF', // sky
  'operator-04': '#FFC15E', // amber
  'operator-05': '#B583FF', // violet
  'operator-06': '#7ED957', // lime
  'operator-07': '#FF8A4C', // orange
  'operator-08': '#E8EDF7', // bone
};

/** Display names, used by the avatar picker. */
export const AVATAR_LABELS: Readonly<Record<AvatarPresetId, string>> = {
  'operator-01': 'Teal',
  'operator-02': 'Coral',
  'operator-03': 'Sky',
  'operator-04': 'Amber',
  'operator-05': 'Violet',
  'operator-06': 'Lime',
  'operator-07': 'Orange',
  'operator-08': 'Bone',
};
