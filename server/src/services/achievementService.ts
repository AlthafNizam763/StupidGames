import { AchievementId } from '@voidline/shared';

/**
 * Achievement criteria.
 *
 * These rules live on the server and are never sent to a client (§35). Two
 * reasons: a player who can read the exact thresholds knows precisely what to
 * farm, and more importantly, nothing in the browser should ever be in a
 * position to *declare* an unlock. The server evaluates these against counters
 * it wrote itself, at match end.
 *
 * The presentation half - names, descriptions - is in `@voidline/shared`,
 * because the profile screen has to render it.
 */

/**
 * Internal counters backing the achievements.
 *
 * Deliberately separate from the public `UserStats`: these exist only to
 * satisfy criteria, and adding them to the published profile shape would make
 * every future achievement a contract change.
 */
export interface AchievementProgress {
  matchesPlayed: number;
  matchesWon: number;
  objectivesCompleted: number;
  /** Matches reached the end of without being eliminated. */
  matchesSurvived: number;
  /** Times this player voted for a Saboteur who was then ejected. */
  decidingVotesAgainstSaboteurs: number;
  /** Operator wins with every objective done and no vote cast against crew. */
  perfectOperatorWins: number;
  /** Saboteur wins in which nobody ever voted for this player. */
  untouchedSaboteurWins: number;
}

export const EMPTY_PROGRESS: AchievementProgress = {
  matchesPlayed: 0,
  matchesWon: 0,
  objectivesCompleted: 0,
  matchesSurvived: 0,
  decidingVotesAgainstSaboteurs: 0,
  perfectOperatorWins: 0,
  untouchedSaboteurWins: 0,
};

type Criterion = (progress: AchievementProgress) => boolean;

const CRITERIA: Readonly<Record<AchievementId, Criterion>> = {
  [AchievementId.FIRST_MATCH]: (p) => p.matchesPlayed >= 1,
  [AchievementId.FIRST_VICTORY]: (p) => p.matchesWon >= 1,
  [AchievementId.OBJECTIVE_EXPERT]: (p) => p.objectivesCompleted >= 100,
  [AchievementId.SURVIVOR]: (p) => p.matchesSurvived >= 10,
  [AchievementId.INVESTIGATOR]: (p) => p.decidingVotesAgainstSaboteurs >= 10,
  [AchievementId.PERFECT_OPERATOR]: (p) => p.perfectOperatorWins >= 1,
  [AchievementId.MASTER_SABOTEUR]: (p) => p.untouchedSaboteurWins >= 1,
};

/**
 * Returns the achievements newly earned by this progress.
 *
 * Already-unlocked ids are excluded, so the caller can award exactly what it
 * gets back without checking for duplicates. Achievements are never revoked: a
 * counter that somehow decreases cannot take one away.
 */
export function evaluateAchievements(
  progress: AchievementProgress,
  alreadyUnlocked: readonly AchievementId[],
): AchievementId[] {
  const held = new Set(alreadyUnlocked);

  return (Object.keys(CRITERIA) as AchievementId[]).filter(
    (id) => !held.has(id) && CRITERIA[id](progress),
  );
}

/**
 * Progress toward an achievement, for a progress bar on the profile.
 *
 * Returns null for achievements with no meaningful partial state - "win one
 * match as a flawless Operator" is either done or not, and a 0/1 bar says less
 * than the locked hint does.
 */
export function achievementProgressRatio(
  id: AchievementId,
  progress: AchievementProgress,
): { current: number; target: number } | null {
  switch (id) {
    case AchievementId.OBJECTIVE_EXPERT:
      return { current: Math.min(progress.objectivesCompleted, 100), target: 100 };
    case AchievementId.SURVIVOR:
      return { current: Math.min(progress.matchesSurvived, 10), target: 10 };
    case AchievementId.INVESTIGATOR:
      return { current: Math.min(progress.decidingVotesAgainstSaboteurs, 10), target: 10 };
    default:
      return null;
  }
}
