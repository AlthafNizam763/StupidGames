import { randomInt } from 'node:crypto';
import { PlayerRole } from '@voidline/shared';

/**
 * Role assignment (§17).
 *
 * `crypto.randomInt`, not `Math.random`. In a game whose entire premise is
 * hidden information, a predictable shuffle is a total break: anyone who can
 * reproduce the sequence knows every role before the match starts, and no
 * amount of server-side secrecy elsewhere matters (SECURITY.md).
 *
 * `Math.random` is a fast non-cryptographic PRNG whose internal state can be
 * recovered from a handful of outputs. That is fine for a particle effect and
 * disqualifying here.
 */

/**
 * Fisher-Yates, with a cryptographically secure source.
 *
 * Returns a new array; this runs once per match, so the allocation is
 * irrelevant and not mutating the caller's list is worth more.
 */
export function secureShuffle<T>(items: readonly T[]): T[] {
  const out = [...items];

  for (let i = out.length - 1; i > 0; i--) {
    // randomInt(0, i + 1) is uniform over [0, i]. Using `randomInt(n) % (i+1)`
    // would introduce modulo bias and skew which players draw which role.
    const j = randomInt(0, i + 1);
    const a = out[i]!;
    const b = out[j]!;
    out[i] = b;
    out[j] = a;
  }

  return out;
}

/**
 * Deals roles to a set of players.
 *
 * Returns a map of player id to role. The caller writes them into match state;
 * this function has no side effects, which is what makes the distribution
 * testable over many runs.
 */
export function assignRoles(
  playerIds: readonly string[],
  saboteurCount: number,
): Map<string, PlayerRole> {
  /*
   * Clamped rather than trusted. Settings validation already enforces that
   * Saboteurs start outnumbered, but this is the last point before roles are
   * dealt - and a match that starts at parity is over before anyone moves.
   */
  const saboteurs = Math.max(0, Math.min(saboteurCount, Math.floor((playerIds.length - 1) / 2)));

  const shuffled = secureShuffle(playerIds);
  const roles = new Map<string, PlayerRole>();

  shuffled.forEach((id, index) => {
    roles.set(id, index < saboteurs ? PlayerRole.SABOTEUR : PlayerRole.OPERATOR);
  });

  return roles;
}
