import { MapId, ZoneId, type MapData } from '@voidline/shared';
import { pointInRect } from './geometry';
import { ORBITAL_09 } from './orbital09';

/**
 * The map registry.
 *
 * One map today. The registry exists so that adding a second is a matter of
 * authoring it and adding a line here, rather than unpicking a hard-coded
 * reference from the room service, the renderer and the collision layer.
 */
const MAPS: Readonly<Record<MapId, MapData>> = {
  [MapId.ORBITAL_09]: ORBITAL_09,
};

export function getMap(id: MapId): MapData {
  return MAPS[id];
}

export function isKnownMap(id: string): id is MapId {
  return id in MAPS;
}

/**
 * Which zone a point is in.
 *
 * Returns CORRIDOR for anywhere outside a room, which is correct rather than a
 * fallback: the space between rooms *is* the corridor on this station.
 *
 * This runs server-side for the authoritative `currentZone` a player reports,
 * and the client computes the same thing for its own HUD. They agree because
 * both read the same shipped geometry.
 */
export function zoneAt(map: MapData, x: number, y: number): ZoneId {
  for (const zone of map.zones) {
    if (pointInRect(x, y, zone.bounds)) return zone.id;
  }
  return ZoneId.CORRIDOR;
}

export { ORBITAL_09 };
