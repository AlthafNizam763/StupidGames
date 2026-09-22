import type { Request, Response } from 'express';
import { ErrorCode } from '@voidline/shared';
import { AppError } from '../lib/AppError';
import { ok } from '../lib/respond';
import { currentUser } from '../middleware/requireAuth';
import { getMatchManager } from '../sockets';
import { grantFor } from '../voice/permissions';
import { voiceProvider } from '../voice/providers';

/**
 * Voice tokens.
 *
 * A player asks for a token; the server decides which channel it is for. The
 * request carries no channel, no room and no permissions - there is nothing in
 * it to forge, which is the same shape as movement and for the same reason.
 */

/** What the client needs to decide whether to show any voice UI at all. */
export function getVoiceCapability(_req: Request, res: Response): void {
  ok(res, voiceProvider().capability, 'OK');
}

export function issueVoiceToken(req: Request, res: Response): void {
  const { userId, username } = currentUser(req);

  const provider = voiceProvider();
  if (!provider.capability.enabled) {
    throw new AppError(ErrorCode.VOICE_UNAVAILABLE, provider.capability.reason);
  }

  const matches = getMatchManager();
  const match = matches?.byRoom(req.body.roomId);
  if (!match) throw new AppError(ErrorCode.NOT_IN_ROOM);

  const player = match.players.get(userId);
  if (!player) throw new AppError(ErrorCode.NOT_IN_ROOM);

  const grant = grantFor(match, player);
  if (!grant) {
    /*
     * No channel right now - during the role reveal, or after the match. A
     * muted token is not issued instead: a token for a room is permission to
     * hear that room, and the correct answer here is no token at all.
     */
    throw new AppError(ErrorCode.VOICE_NOT_PERMITTED, 'Voice is not open right now.');
  }

  ok(res, provider.issue(userId, username, grant), 'OK');
}
