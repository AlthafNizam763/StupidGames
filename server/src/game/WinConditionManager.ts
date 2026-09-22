import { ConnectionState, PlayerRole, Team, WinReason } from '@voidline/shared';
import { allTasksComplete } from './TaskManager';
import { criticalExpired } from './SabotageManager';
import type { Match } from './match/types';

/**
 * Win conditions (§26).
 *
 * Evaluated only here, only from server state, and called after every event
 * that could change the answer: an elimination, an ejection, an objective, a
 * sabotage resolving, a disconnect, and every tick while a critical countdown
 * runs.
 *
 * Nothing a client sends can reach this function. There is no event that says
 * "the match is over" - the server decides and tells them.
 */

export interface Outcome {
  winner: Team;
  reason: WinReason;
}

/**
 * The living head count, by side.
 *
 * Disconnected players still count while their seat is held: they are still in
 * the match and may come back. Only a released seat removes them, which is what
 * `TEAM_ABANDONED` below is about.
 */
function census(match: Match) {
  let operators = 0;
  let saboteurs = 0;
  let connectedOperators = 0;
  let connectedSaboteurs = 0;

  for (const player of match.players.values()) {
    if (!player.alive) continue;

    /*
     * RECONNECTING counts as present.
     *
     * A dropped connection holds the seat for the grace period - the player has
     * not left, they are coming back. Counting them as gone would hand the
     * other side a TEAM_ABANDONED win because somebody's train went through a
     * tunnel. Only DISCONNECTED, which is set when the grace period expires,
     * means they are actually out.
     */
    const connected = player.connection !== ConnectionState.DISCONNECTED;

    if (player.role === PlayerRole.SABOTEUR) {
      saboteurs += 1;
      if (connected) connectedSaboteurs += 1;
    } else {
      operators += 1;
      if (connected) connectedOperators += 1;
    }
  }

  return { operators, saboteurs, connectedOperators, connectedSaboteurs };
}

export function evaluate(match: Match, now = Date.now()): Outcome | null {
  // Already decided. Re-evaluating could otherwise overwrite the real reason
  // with a later, incidental one.
  if (match.outcome) return null;

  const { operators, saboteurs, connectedOperators, connectedSaboteurs } = census(match);

  /*
   * Saboteur wins are checked first.
   *
   * A critical sabotage expiring at the same tick as the last objective
   * completing is a real race, and the sabotage should win it: the station was
   * already lost when the countdown hit zero, whereas the objective bar filling
   * is what *would* have saved it.
   */
  if (criticalExpired(match, now)) {
    return { winner: Team.SABOTEURS, reason: WinReason.CRITICAL_SABOTAGE };
  }

  // Parity, not majority. Once Saboteurs equal Operators they cannot be voted
  // out, so the match is decided even though bodies remain.
  if (saboteurs > 0 && saboteurs >= operators) {
    return { winner: Team.SABOTEURS, reason: WinReason.SABOTEURS_REACHED_PARITY };
  }

  if (saboteurs === 0) {
    return { winner: Team.OPERATORS, reason: WinReason.SABOTEURS_ELIMINATED };
  }

  if (allTasksComplete(match)) {
    return { winner: Team.OPERATORS, reason: WinReason.OBJECTIVES_COMPLETED };
  }

  /*
   * Abandonment.
   *
   * If every living member of one side has gone and is not coming back, the
   * other side takes it. Without this a single player left alone in a room
   * would sit there until the reaper closed it, with no result and no XP.
   *
   * Checked last: a real win condition should always take precedence over a
   * forfeit, so a team that wins on the same tick it loses its connection wins.
   */
  if (connectedSaboteurs === 0 && saboteurs > 0) {
    return { winner: Team.OPERATORS, reason: WinReason.TEAM_ABANDONED };
  }
  if (connectedOperators === 0 && operators > 0) {
    return { winner: Team.SABOTEURS, reason: WinReason.TEAM_ABANDONED };
  }

  return null;
}

/** Human-readable summary for the results screen and the log. */
export function describeOutcome(outcome: Outcome): string {
  switch (outcome.reason) {
    case WinReason.OBJECTIVES_COMPLETED:
      return 'Every station objective was completed.';
    case WinReason.SABOTEURS_ELIMINATED:
      return 'Every Saboteur was removed from the station.';
    case WinReason.SABOTEURS_REACHED_PARITY:
      return 'The Saboteurs equalled the remaining Operators.';
    case WinReason.CRITICAL_SABOTAGE:
      return 'A critical system failed before it could be repaired.';
    case WinReason.TEAM_ABANDONED:
      return 'One side abandoned the station.';
    default:
      return 'The match ended.';
  }
}
