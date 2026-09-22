import { AchievementId } from './game';

/**
 * Achievement *presentation*: the name and description a player reads.
 *
 * The unlock criteria are NOT here. They live server-side in the achievement
 * registry, where they are evaluated against match results the client never
 * gets to influence. Shipping the rules to the browser would tell a player
 * exactly what to farm, and worse, would invite the assumption that the client
 * could report an unlock itself.
 *
 * The text sits in the shared contract because both the profile screen and the
 * end-of-match summary render it, and because this is the natural extraction
 * point when i18n lands.
 *
 * NAMING. The wire protocol calls the hostile faction `SABOTEUR`; the player
 * reads "the Cat". Every other player-facing surface gets that translation from
 * `web/lib/fiction.ts`, but the strings here are rendered as written, so this
 * file is the one place the rule cannot be enforced structurally. Anything a
 * person reads in here says "the Cat" - and the `AchievementId` enum keeps
 * saying `MASTER_SABOTEUR`, because an id is not copy.
 */
export interface AchievementInfo {
  id: AchievementId;
  name: string;
  /** What the player did. Written in the past tense, as an accomplishment. */
  description: string;
  /** A hint at how to get it, shown while still locked. */
  hint: string;
}

export const ACHIEVEMENTS: Readonly<Record<AchievementId, AchievementInfo>> = {
  [AchievementId.FIRST_MATCH]: {
    id: AchievementId.FIRST_MATCH,
    name: 'First Rotation',
    description: 'Completed your first shift aboard ORBITAL-09.',
    hint: 'Finish a match.',
  },
  [AchievementId.FIRST_VICTORY]: {
    id: AchievementId.FIRST_VICTORY,
    name: 'Station Secured',
    description: 'Won your first match.',
    hint: 'Win a match on either side.',
  },
  [AchievementId.PERFECT_OPERATOR]: {
    id: AchievementId.PERFECT_OPERATOR,
    name: 'Perfect Operator',
    description: 'Won as an Operator with every assigned objective complete and no wrong votes.',
    hint: 'Win as an Operator without a single misstep.',
  },
  [AchievementId.MASTER_SABOTEUR]: {
    id: AchievementId.MASTER_SABOTEUR,
    name: 'Nine Lives',
    description: 'Won as the Cat without ever being voted on.',
    hint: 'Win as the Cat while staying above suspicion.',
  },
  [AchievementId.OBJECTIVE_EXPERT]: {
    id: AchievementId.OBJECTIVE_EXPERT,
    name: 'Systems Expert',
    description: 'Completed one hundred station objectives.',
    hint: 'Complete 100 objectives across all matches.',
  },
  [AchievementId.SURVIVOR]: {
    id: AchievementId.SURVIVOR,
    name: 'Survivor',
    description: 'Reached the end of ten matches without being eliminated.',
    hint: 'Survive to the end of 10 matches.',
  },
  [AchievementId.INVESTIGATOR]: {
    id: AchievementId.INVESTIGATOR,
    name: 'Investigator',
    description: 'Cast the deciding vote against the Cat ten times.',
    hint: 'Help eject the Cat 10 times.',
  },
};

/** Stable display order for the profile grid. */
export const ACHIEVEMENT_ORDER: readonly AchievementId[] = [
  AchievementId.FIRST_MATCH,
  AchievementId.FIRST_VICTORY,
  AchievementId.OBJECTIVE_EXPERT,
  AchievementId.SURVIVOR,
  AchievementId.INVESTIGATOR,
  AchievementId.PERFECT_OPERATOR,
  AchievementId.MASTER_SABOTEUR,
];
