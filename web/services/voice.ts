import type { VoiceCapability, VoiceToken } from '@voidline/shared';
import { http } from './http';

/**
 * Voice chat (§24).
 *
 * Two calls, and almost all of the design is in what they do *not* take.
 *
 * `token` sends the room and nothing else. The channel a player joins and what
 * they are allowed to do there - speak, listen, or neither - are derived
 * server-side from live match state: whether they are alive, which phase the
 * match is in, and whether comms are down. There is no parameter here for a
 * client to ask for a channel, because asking is how a client would put itself
 * somewhere it had not earned.
 *
 * In particular there is no Saboteur channel to request. A private channel for
 * one team is the easiest possible way to leak a role - a player visibly
 * talking while nobody else hears anything has told the room what they are.
 */
export const voiceApi = {
  /**
   * Whether voice is configured at all, and by which provider.
   *
   * Voice is optional: a deployment with no provider configured answers with a
   * disabled capability rather than failing. Check this before offering any
   * voice affordance, so an unconfigured deployment shows no dead controls.
   */
  capability(): Promise<VoiceCapability> {
    return http.get<VoiceCapability>('/api/voice/capability');
  },

  /**
   * A short-lived join token for the caller's current room.
   *
   * Returns null-equivalent grants rather than throwing when the player is not
   * entitled to a channel - during the role reveal, for instance, when everyone
   * is silent. Re-request after a phase change: a token minted while alive does
   * not become a dead player's token, which is the point.
   */
  token(roomId: string): Promise<VoiceToken> {
    return http.post<VoiceToken>('/api/voice/token', { roomId });
  },
};
