import jwt from 'jsonwebtoken';
import {
  ErrorCode,
  VoiceProviderName,
  type VoiceCapability,
  type VoiceGrant,
  type VoiceToken,
} from '@voidline/shared';
import { config } from '../config/env';
import { AppError } from '../lib/AppError';
import { logger } from '../lib/logger';

/**
 * Voice providers, behind one interface.
 *
 * The permission decision is made before any of this (see permissions.ts); a
 * provider's only job is to turn an already-authorised grant into credentials
 * its SDK will accept. That split is what makes the choice of provider a
 * configuration detail rather than a security decision.
 *
 * Tokens are minted server-side, always. A client that could mint its own would
 * choose its own room, which is the entire permission model gone.
 */

export interface VoiceProvider {
  readonly name: VoiceProviderName;
  readonly capability: VoiceCapability;
  /** Credentials for one player on one channel. */
  issue(identity: string, displayName: string, grant: VoiceGrant): VoiceToken;
}

/** How long a voice token is valid. Long enough for a match, short enough to matter. */
const TOKEN_TTL_SECONDS = 60 * 60;

/**
 * Voice is not configured.
 *
 * Not a stub that pretends to work: it reports itself as unavailable so the
 * client hides the voice controls entirely, and refuses to issue anything if
 * asked. The game is fully playable without voice, and a dead microphone button
 * is worse than no button.
 */
class DisabledProvider implements VoiceProvider {
  readonly name = VoiceProviderName.NONE;
  readonly capability: VoiceCapability = {
    enabled: false,
    provider: VoiceProviderName.NONE,
    reason: 'Voice chat is not configured on this server.',
  };

  issue(): never {
    throw new AppError(ErrorCode.VOICE_UNAVAILABLE);
  }
}

/**
 * LiveKit.
 *
 * Its access token is an HS256 JWT with a documented, stable claim set, so this
 * is a complete implementation rather than a call into an SDK - which also
 * means it is testable without a LiveKit server: the token can be decoded and
 * its grants asserted.
 *
 * The claims that matter:
 *   `video.room`          the room, fixed by the server
 *   `video.roomJoin`      permission to join it
 *   `video.canPublish`    may speak
 *   `video.canSubscribe`  may hear
 *
 * `roomCreate` is deliberately absent: a client must not be able to bring a
 * room into existence, only to join the one it was granted.
 */
class LiveKitProvider implements VoiceProvider {
  readonly name = VoiceProviderName.LIVEKIT;
  readonly capability: VoiceCapability = {
    enabled: true,
    provider: VoiceProviderName.LIVEKIT,
  };

  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly serverUrl: string,
  ) {}

  issue(identity: string, displayName: string, grant: VoiceGrant): VoiceToken {
    const now = Math.floor(Date.now() / 1000);

    const token = jwt.sign(
      {
        // LiveKit reads the subject as the participant identity, which is how
        // the client maps an audio track back to a player.
        sub: identity,
        name: displayName,
        iss: this.apiKey,
        nbf: now,
        exp: now + TOKEN_TTL_SECONDS,
        video: {
          room: grant.room,
          roomJoin: true,
          canPublish: grant.publish,
          canSubscribe: grant.subscribe,
          // No data channel: gameplay messages go over our own socket, where
          // they are validated. A second, unvalidated channel between clients
          // would be a way around every rule in the game.
          canPublishData: false,
        },
      },
      this.apiSecret,
      { algorithm: 'HS256' },
    );

    return {
      token,
      serverUrl: this.serverUrl,
      grant,
      expiresIn: TOKEN_TTL_SECONDS,
      provider: VoiceProviderName.LIVEKIT,
    };
  }
}

/**
 * A provider named in configuration but not implemented here.
 *
 * Agora and Daily use different token formats, and Native WebRTC needs
 * signalling this server does not yet do. Rather than ship something that looks
 * like support and fails at the first call, this reports itself unavailable and
 * says which provider was asked for. Implementing one is a matter of writing a
 * `VoiceProvider` - nothing above this layer changes.
 */
class UnimplementedProvider implements VoiceProvider {
  readonly capability: VoiceCapability;

  constructor(readonly name: VoiceProviderName) {
    this.capability = {
      enabled: false,
      provider: name,
      reason: `Voice provider "${name}" is configured but not implemented on this server.`,
    };
  }

  issue(): never {
    throw new AppError(ErrorCode.VOICE_UNAVAILABLE, this.capability.reason);
  }
}

function build(): VoiceProvider {
  const name = config.voice.provider;

  if (name === VoiceProviderName.NONE) return new DisabledProvider();

  if (name === VoiceProviderName.LIVEKIT) {
    const { apiKey, apiSecret, serverUrl } = config.voice;

    if (!apiKey || !apiSecret || !serverUrl) {
      // Misconfiguration reads as unavailable rather than crashing the server:
      // voice is an enhancement, and a missing key should not stop a match.
      logger.error(
        'VOICE_PROVIDER is livekit but VOICE_API_KEY, VOICE_API_SECRET or VOICE_SERVER_URL is missing - voice disabled',
      );
      return new DisabledProvider();
    }

    logger.info({ provider: name }, 'voice chat enabled');
    return new LiveKitProvider(apiKey, apiSecret, serverUrl);
  }

  logger.warn({ provider: name }, 'voice provider is not implemented - voice disabled');
  return new UnimplementedProvider(name);
}

let provider: VoiceProvider | null = null;

export function voiceProvider(): VoiceProvider {
  provider ??= build();
  return provider;
}

/** Test seam. Never called in production code. */
export function setVoiceProvider(next: VoiceProvider | null): void {
  provider = next;
}

export { DisabledProvider, LiveKitProvider, UnimplementedProvider };
