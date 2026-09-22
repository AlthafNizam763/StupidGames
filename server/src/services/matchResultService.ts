import {
  ROLE_TEAM,
  Team,
  XP_AWARDS,
  levelForXp,
  type AchievementId,
  type MatchPlayerResult,
  type MatchResult,
  type XpLineItem,
} from '@voidline/shared';
import { logger } from '../lib/logger';
import { MatchModel } from '../models/Match';
import { UserModel } from '../models/User';
import type { Match, MatchPlayer } from '../game/match/types';
import { EMPTY_PROGRESS, evaluateAchievements, type AchievementProgress } from './achievementService';

/**
 * Match results, XP and achievements (§21, §34, §35).
 *
 * Everything here is computed from server-held match state. No endpoint and no
 * socket event accepts an XP figure, a stat or an achievement - the client is
 * told what it earned, and has no way to assert it (SECURITY.md).
 *
 * This runs once per match. It persists the match, updates every participant's
 * account, and returns the results payload.
 */

/** Builds one player's XP breakdown from what they actually did. */
function computeXp(player: MatchPlayer, won: boolean): { total: number; lines: XpLineItem[] } {
  const lines: XpLineItem[] = [{ label: 'Match completed', amount: XP_AWARDS.MATCH_COMPLETED }];

  if (player.objectivesCompleted > 0) {
    lines.push({
      label: `Objectives (${player.objectivesCompleted})`,
      amount: XP_AWARDS.OBJECTIVE_COMPLETED * player.objectivesCompleted,
    });
  }

  if (won) lines.push({ label: 'Winning team', amount: XP_AWARDS.WINNING_TEAM });
  if (player.survived) lines.push({ label: 'Survived', amount: XP_AWARDS.SURVIVED_TO_END });

  if (player.eliminations > 0) {
    lines.push({
      label: `Eliminations (${player.eliminations})`,
      amount: XP_AWARDS.SUCCESSFUL_ELIMINATION * player.eliminations,
    });
  }

  if (player.councilsParticipated > 0) {
    lines.push({
      label: 'Council participation',
      amount: XP_AWARDS.COUNCIL_PARTICIPATION * player.councilsParticipated,
    });
  }

  if (player.correctEjectionVotes > 0) {
    lines.push({
      label: `Correct votes (${player.correctEjectionVotes})`,
      amount: XP_AWARDS.CORRECT_EJECTION_VOTE * player.correctEjectionVotes,
    });
  }

  return { total: lines.reduce((sum, line) => sum + line.amount, 0), lines };
}

/**
 * Persists a finished match and updates every participant.
 *
 * Failures are contained per player: one account failing to update must not
 * cost everyone else their XP, and must not prevent the match being recorded.
 */
export async function finaliseMatch(match: Match): Promise<MatchResult> {
  if (!match.outcome) throw new Error('finaliseMatch called on a match with no outcome');

  const endedAt = match.endedAt ?? Date.now();
  const duration = Math.round((endedAt - match.startedAt) / 1000);
  const winner = match.outcome.winner === 'OPERATORS' ? Team.OPERATORS : Team.SABOTEURS;

  const results: MatchPlayerResult[] = [];

  for (const player of match.players.values()) {
    const won = ROLE_TEAM[player.role] === winner;
    const { total, lines } = computeXp(player, won);

    let levelBefore = 1;
    let levelAfter = 1;
    let unlocked: AchievementId[] = [];

    try {
      const updated = await applyToAccount(player, won, total);
      levelBefore = updated.levelBefore;
      levelAfter = updated.levelAfter;
      unlocked = updated.unlocked;
    } catch (error) {
      // The match still happened and still counts for everyone else.
      logger.error(
        { err: error, userId: player.userId, matchId: match.id },
        'failed to apply match result to account',
      );
    }

    results.push({
      userId: player.userId,
      username: player.username,
      avatar: player.avatar,
      // Roles are public once a match is over - that is the reveal.
      role: player.role,
      survived: player.survived,
      objectivesCompleted: player.objectivesCompleted,
      eliminations: player.eliminations,
      xpEarned: total,
      xpBreakdown: lines,
      unlocked,
      levelBefore,
      levelAfter,
    });
  }

  try {
    await MatchModel.create({
      roomCode: match.code,
      map: match.map.id,
      gameMode: match.settings.gameMode,
      settings: match.settings,
      players: results.map((result) => ({
        userId: result.userId,
        username: result.username,
        avatar: result.avatar,
        role: result.role,
        survived: result.survived,
        objectivesCompleted: result.objectivesCompleted,
        eliminations: result.eliminations,
        xpEarned: result.xpEarned,
        won: ROLE_TEAM[result.role] === winner,
      })),
      winner,
      reason: match.outcome.reason,
      duration,
      startedAt: new Date(match.startedAt),
      endedAt: new Date(endedAt),
    });
  } catch (error) {
    // Players keep their XP even if the history record fails to write.
    logger.error({ err: error, matchId: match.id }, 'failed to persist match');
  }

  return {
    matchId: match.id,
    winner,
    reason: match.outcome.reason as MatchResult['reason'],
    duration,
    players: results,
    endedAt: new Date(endedAt).toISOString(),
  };
}

/**
 * Writes one player's XP, stats and achievements.
 *
 * Read-modify-write rather than an atomic `$inc`, because achievements have to
 * be evaluated against the *resulting* counters and a `$inc` would not tell us
 * what they became. A player is in one match at a time, so there is no
 * concurrent writer to lose an update to.
 */
async function applyToAccount(
  player: MatchPlayer,
  won: boolean,
  xpEarned: number,
): Promise<{ levelBefore: number; levelAfter: number; unlocked: AchievementId[] }> {
  const user = await UserModel.findById(player.userId).select('+achievementProgress').exec();
  if (!user) return { levelBefore: 1, levelAfter: 1, unlocked: [] };

  const levelBefore = user.level;

  user.xp += xpEarned;
  user.stats.matchesPlayed += 1;
  if (won) user.stats.matchesWon += 1;
  else user.stats.matchesLost += 1;

  if (player.role === 'SABOTEUR') {
    if (won) user.stats.saboteurWins += 1;
  } else if (won) {
    user.stats.operatorWins += 1;
  }

  user.stats.eliminations += player.eliminations;
  user.stats.objectivesCompleted += player.objectivesCompleted;

  const progress: AchievementProgress = {
    ...EMPTY_PROGRESS,
    matchesPlayed: user.stats.matchesPlayed,
    matchesWon: user.stats.matchesWon,
    objectivesCompleted: user.stats.objectivesCompleted,
    matchesSurvived:
      (user.achievementProgress?.matchesSurvived ?? 0) + (player.survived ? 1 : 0),
    decidingVotesAgainstSaboteurs:
      (user.achievementProgress?.decidingVotesAgainstSaboteurs ?? 0) +
      player.correctEjectionVotes,
    perfectOperatorWins:
      (user.achievementProgress?.perfectOperatorWins ?? 0) +
      (won && player.role === 'OPERATOR' && !player.votedAgainstCrew && player.survived ? 1 : 0),
    untouchedSaboteurWins:
      (user.achievementProgress?.untouchedSaboteurWins ?? 0) +
      (won && player.role === 'SABOTEUR' && !player.everVotedFor ? 1 : 0),
  };

  user.achievementProgress = progress;

  const held = user.achievements.map((entry) => entry.id as AchievementId);
  const unlocked = evaluateAchievements(progress, held);

  for (const id of unlocked) {
    user.achievements.push({ id, unlockedAt: new Date() });
  }

  // `level` is kept in step by the model's pre-save hook whenever xp changes.
  await user.save();

  return { levelBefore, levelAfter: levelForXp(user.xp), unlocked };
}
