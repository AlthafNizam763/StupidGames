import { GamePhase, VoiceChannel, type VoiceGrant } from '@voidline/shared';
import type { Match, MatchPlayer } from '../game/match/types';

/**
 * Who may speak, and who may hear (§36).
 *
 * This is the whole security surface of voice chat, and it is a pure function
 * of server state: the match phase and whether the player is alive. A client
 * asks for a token and is told which channel it is for; it cannot ask for a
 * different one, because the channel is not an input.
 *
 * The reason this matters more than it looks: voice carries far more than text.
 * A dead player who could hear the living channel would know who is walking
 * with whom, who is panicking, and who went quiet at the moment of a kill -
 * every piece of information the game exists to hide. Text chat has the same
 * rule and a fraction of the consequence.
 *
 * The rule, stated once:
 *
 *   living players hear living players
 *   dead players hear dead players
 *   the two sets never intersect during a live match
 *
 * There is deliberately no Saboteur voice channel. A private channel for one
 * team is the single easiest way to leak a role - a player who is visibly
 * talking when nobody else hears anything has told everyone what they are - and
 * the text channel exists for coordination if a mode ever wants it.
 */

/** Provider room name. Includes the match, so two matches never share a room. */
export function roomNameFor(matchId: string, channel: VoiceChannel): string {
  return `voidline:${matchId}:${channel.toLowerCase()}`;
}

/**
 * The grant a player is entitled to right now.
 *
 * Returns null when they may not be on voice at all - which the caller must
 * treat as "issue no token", not as "issue a muted one". A token for a channel
 * is permission to hear it.
 */
export function grantFor(match: Match, player: MatchPlayer): VoiceGrant | null {
  const channel = channelFor(match, player);
  if (!channel) return null;

  return {
    channel,
    room: roomNameFor(match.id, channel),
    // Every channel a player can be on, they can speak on. The split exists in
    // the type because publish and subscribe are different permissions, not
    // because this game currently uses the asymmetry.
    publish: true,
    subscribe: true,
  };
}

function channelFor(match: Match, player: MatchPlayer): VoiceChannel | null {
  /*
   * Dead first, and before any phase check.
   *
   * Ordering it this way means there is no phase in which a dead player can
   * fall through into a living channel. A later phase added to the switch below
   * cannot accidentally grant them the living room, because they never reach
   * it.
   */
  if (!player.alive) return VoiceChannel.DEAD;

  switch (match.phase) {
    case GamePhase.LOBBY:
    case GamePhase.WAITING:
      // No roles have been dealt, so there is nothing to give away.
      return VoiceChannel.LOBBY;

    case GamePhase.STARTING:
      /*
       * Silent during the role reveal. A player reacting out loud to their own
       * role - a laugh, a groan - at the exact moment everyone is looking at
       * their screen is a tell, and it is the one moment the game can prevent.
       */
      return null;

    case GamePhase.PLAYING:
    case GamePhase.SABOTAGE:
      return VoiceChannel.PROXIMITY;

    case GamePhase.COUNCIL:
    case GamePhase.VOTING:
    case GamePhase.EJECTION:
      return VoiceChannel.COUNCIL;

    case GamePhase.RESULTS:
      // Roles are public. Nothing left to protect.
      return VoiceChannel.RESULTS;

    case GamePhase.ENDED:
    default:
      return null;
  }
}

/**
 * Whether two players could hear each other.
 *
 * Exists to be asserted against rather than called in anger: it is the property
 * the tests check exhaustively across every phase and liveness combination,
 * which is a stronger statement than testing `grantFor` one case at a time.
 */
export function canHear(match: Match, listener: MatchPlayer, speaker: MatchPlayer): boolean {
  const listenerGrant = grantFor(match, listener);
  const speakerGrant = grantFor(match, speaker);

  if (!listenerGrant || !speakerGrant) return false;
  if (!listenerGrant.subscribe || !speakerGrant.publish) return false;

  return listenerGrant.room === speakerGrant.room;
}
