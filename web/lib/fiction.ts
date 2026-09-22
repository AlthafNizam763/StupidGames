import { PlayerRole, Team, WinReason } from '@voidline/shared';

/**
 * The fiction layer: protocol names in, player-facing names out.
 *
 * The wire protocol calls the hostile faction `SABOTEUR`, and it will keep
 * calling it that - the name is in the shared contract, in the server's rules,
 * in SECURITY.md and in a couple of hundred tests. Renaming an enum across
 * three workspaces to change a word on a screen is a large, risky edit that
 * buys nothing the protocol cares about.
 *
 * What the *player* sees is a different question, and the answer is the Cat.
 * Every surface a person reads goes through this module, so the two never
 * drift and there is exactly one place to change the wording.
 *
 *   wire            player reads
 *   ----            ------------
 *   OPERATOR        Operator
 *   SABOTEUR        The Cat
 *   Team.OPERATORS  Operators
 *   Team.SABOTEURS  The Cat
 *
 * This is presentation only. It decides nothing, it hides nothing, and it is
 * never the thing keeping a role secret - secrecy is enforced server-side by
 * payload shape (§BG). Translating a role you were never sent is impossible,
 * which is exactly the property we want.
 */

export interface RoleIdentity {
  /** What the role is called, in title case. */
  name: string;
  /** Upper-case display form, for headings. */
  display: string;
  /** One line, second person, said at the moment of the reveal. */
  premise: string;
  /** The two or three things this role does, for the reveal and onboarding. */
  objectives: readonly string[];
  /**
   * Which accent carries this role in the UI.
   *
   * `cat` is reserved for the private surfaces of the player who is the Cat,
   * and for post-match reveals. It appears nowhere a second person could see
   * it during a live match.
   */
  accent: 'signal' | 'cat';
}

export const ROLE_IDENTITY: Readonly<Record<PlayerRole, RoleIdentity>> = {
  [PlayerRole.OPERATOR]: {
    name: 'Operator',
    display: 'OPERATOR',
    premise: 'You are crew. Keep ORBITAL-09 running.',
    objectives: [
      'Complete your station objectives.',
      'Work out who is not what they seem.',
      'Survive the rotation.',
    ],
    accent: 'signal',
  },
  [PlayerRole.SABOTEUR]: {
    name: 'The Cat',
    display: 'THE CAT',
    premise: 'You are not crew. You are wearing one.',
    objectives: [
      'Blend in. You look exactly like everybody else.',
      'Eliminate the crew, quietly.',
      'Do not get caught.',
    ],
    accent: 'cat',
  },
};

export const TEAM_NAME: Readonly<Record<Team, string>> = {
  [Team.OPERATORS]: 'Operators',
  [Team.SABOTEURS]: 'The Cat',
};

/** The headline on the results screen, per winning side. */
export const TEAM_VICTORY_HEADLINE: Readonly<Record<Team, string>> = {
  [Team.OPERATORS]: 'THE CAT HAS BEEN FOUND',
  [Team.SABOTEURS]: 'THE CAT WINS',
};

/**
 * Why the match ended, in words.
 *
 * Written from nobody's point of view in particular - the same sentence is
 * shown to the winners and the losers, and a line that gloats reads badly to
 * half the room.
 */
export const WIN_REASON_COPY: Readonly<Record<WinReason, string>> = {
  [WinReason.OBJECTIVES_COMPLETED]: 'Every station objective was completed.',
  [WinReason.SABOTEURS_ELIMINATED]: 'The crew found what was hiding among them.',
  [WinReason.SABOTEURS_REACHED_PARITY]: 'Too few of the crew were left to stop it.',
  [WinReason.CRITICAL_SABOTAGE]: 'The station failed before anyone could repair it.',
  [WinReason.TEAM_ABANDONED]: 'One side left the station.',
};

/** Is this role the hidden one? Used to pick an accent, never to reveal anything. */
export function isHiddenRole(role: PlayerRole): boolean {
  return role === PlayerRole.SABOTEUR;
}

export function roleIdentity(role: PlayerRole): RoleIdentity {
  return ROLE_IDENTITY[role];
}
