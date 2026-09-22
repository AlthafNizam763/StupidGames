/**
 * Voice chat (§36).
 *
 * The shape of a voice grant. The *derivation* - which channel a player may be
 * in, and whether they may speak - is server-side, because it is the same class
 * of secret as a role: a player who could put themselves on the living channel
 * while dead would hear every footstep and every accusation.
 */

export const VoiceChannel = {
  /** Before the match. No secrets exist yet, so everybody talks. */
  LOBBY: 'LOBBY',
  /** Living players during free roam. Attenuated by distance client-side. */
  PROXIMITY: 'PROXIMITY',
  /** Living players during a council. */
  COUNCIL: 'COUNCIL',
  /** Eliminated players. Never audible to the living. */
  DEAD: 'DEAD',
  /** After the match, when every role is public. */
  RESULTS: 'RESULTS',
} as const;
export type VoiceChannel = (typeof VoiceChannel)[keyof typeof VoiceChannel];

/**
 * What a player may do on a channel.
 *
 * `publish` and `subscribe` are separate because they are genuinely different
 * permissions. There is no case in this game where a player may publish to a
 * channel they cannot hear, but there are cases - spectating, for instance -
 * where the reverse would be reasonable, and collapsing them into one boolean
 * would make that impossible to express later.
 */
export interface VoiceGrant {
  channel: VoiceChannel;
  /** The provider-side room name. Derived, never supplied by the client. */
  room: string;
  publish: boolean;
  subscribe: boolean;
}

/** What the client needs to join. Issued by the server, short-lived. */
export interface VoiceToken {
  /** Provider access token. Opaque to the client beyond handing it to the SDK. */
  token: string;
  /** Where the SDK should connect. */
  serverUrl: string;
  grant: VoiceGrant;
  /** Seconds until the token expires. */
  expiresIn: number;
  provider: VoiceProviderName;
}

export const VoiceProviderName = {
  /** Voice is off. The game is fully playable without it. */
  NONE: 'none',
  LIVEKIT: 'livekit',
  AGORA: 'agora',
  DAILY: 'daily',
  WEBRTC: 'webrtc',
} as const;
export type VoiceProviderName = (typeof VoiceProviderName)[keyof typeof VoiceProviderName];

/** Reported to the client so it can hide the voice UI rather than offer a dead button. */
export interface VoiceCapability {
  enabled: boolean;
  provider: VoiceProviderName;
  /** Why it is unavailable, when it is. Shown to the player. */
  reason?: string;
}
