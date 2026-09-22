import type { Request, Response } from 'express';
import { ErrorCode } from '@voidline/shared';
import { getMap, isKnownMap } from '../game/maps';
import { AppError } from '../lib/AppError';
import { ok } from '../lib/respond';
import { validated } from '../middleware/validate';

/**
 * Map data.
 *
 * Served over REST rather than pushed down the socket: it is large, entirely
 * static, and identical for every player in every match. Sending it on
 * `game:start` would put a few hundred kilobytes on the critical path of every
 * match beginning, for data the client almost certainly already has.
 */
export function getMapData(_req: Request, res: Response): void {
  const { mapId } = validated<{ mapId: string }>(res, 'params');

  if (!isKnownMap(mapId)) {
    throw new AppError(ErrorCode.NOT_FOUND, 'No such map.');
  }

  const map = getMap(mapId);

  /*
   * Cacheable and revalidated by ETag. The geometry only changes when the map
   * is re-authored, and `version` moves with it - so a returning player
   * normally gets a 304 and no body at all.
   */
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('ETag', `"${map.id}-v${map.version}"`);

  ok(res, map, 'OK');
}
