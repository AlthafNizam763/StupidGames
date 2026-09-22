import type { MapData, MapId } from '@voidline/shared';
import { http } from './http';

/**
 * Map data.
 *
 * Cached in memory for the life of the tab. The geometry is large, static and
 * identical for every match, so refetching it each time a player enters a room
 * would be a few hundred kilobytes spent re-downloading something that has not
 * changed. The server also sends cache headers, so even a cold tab usually gets
 * a 304.
 */
const cache = new Map<string, MapData>();

export const mapsApi = {
  async get(mapId: MapId): Promise<MapData> {
    const cached = cache.get(mapId);
    if (cached) return cached;

    const map = await http.get<MapData>(`/api/maps/${mapId}`);
    cache.set(mapId, map);
    return map;
  },

  /** Clears the cache. Used when a map's version changes under a long-lived tab. */
  invalidate(mapId?: MapId): void {
    if (mapId) cache.delete(mapId);
    else cache.clear();
  },
};
