/**
 * VOIDLINE map identity.
 *
 * ORBITAL-09 is an original facility layout designed for this project. Only the
 * *identity* of the map (its id, its zones, their display names) lives in the
 * shared contract, because both sides need to name a zone in an event payload.
 *
 * Geometry - walls, collision polygons, spawn points, terminal placement - is
 * deliberately NOT here. It is authored server-side in PHASE 10 and shipped to
 * the client as map data, so a layout change never requires a protocol change.
 */

export const MapId = {
  ORBITAL_09: 'ORBITAL_09',
} as const;
export type MapId = (typeof MapId)[keyof typeof MapId];

export const ALL_MAP_IDS: readonly MapId[] = [MapId.ORBITAL_09];

export const DEFAULT_MAP_ID: MapId = MapId.ORBITAL_09;

/** The ten zones of ORBITAL-09. */
export const ZoneId = {
  COMMAND_DECK: 'COMMAND_DECK',
  REACTOR_CORE: 'REACTOR_CORE',
  MEDICAL_BAY: 'MEDICAL_BAY',
  RESEARCH_LAB: 'RESEARCH_LAB',
  CARGO_BAY: 'CARGO_BAY',
  COMMUNICATIONS: 'COMMUNICATIONS',
  ENGINE_ROOM: 'ENGINE_ROOM',
  HYDROPONICS: 'HYDROPONICS',
  SECURITY: 'SECURITY',
  OBSERVATORY: 'OBSERVATORY',
  /** Connecting corridors. Not a room, but a player can stand in one. */
  CORRIDOR: 'CORRIDOR',
} as const;
export type ZoneId = (typeof ZoneId)[keyof typeof ZoneId];

/** Rooms a player can be reported as being in, in council order. Excludes corridors. */
export const ROOM_ZONE_IDS: readonly ZoneId[] = [
  ZoneId.COMMAND_DECK,
  ZoneId.REACTOR_CORE,
  ZoneId.MEDICAL_BAY,
  ZoneId.RESEARCH_LAB,
  ZoneId.CARGO_BAY,
  ZoneId.COMMUNICATIONS,
  ZoneId.ENGINE_ROOM,
  ZoneId.HYDROPONICS,
  ZoneId.SECURITY,
  ZoneId.OBSERVATORY,
];

/**
 * Display names. The client renders these directly in V1; PHASE 37 replaces the
 * lookup with an i18n key of the same shape.
 */
export const ZONE_LABELS: Readonly<Record<ZoneId, string>> = {
  [ZoneId.COMMAND_DECK]: 'Command Deck',
  [ZoneId.REACTOR_CORE]: 'Reactor Core',
  [ZoneId.MEDICAL_BAY]: 'Medical Bay',
  [ZoneId.RESEARCH_LAB]: 'Research Lab',
  [ZoneId.CARGO_BAY]: 'Cargo Bay',
  [ZoneId.COMMUNICATIONS]: 'Communications',
  [ZoneId.ENGINE_ROOM]: 'Engine Room',
  [ZoneId.HYDROPONICS]: 'Hydroponics',
  [ZoneId.SECURITY]: 'Security',
  [ZoneId.OBSERVATORY]: 'Observatory',
  [ZoneId.CORRIDOR]: 'Corridor',
};

export const MAP_LABELS: Readonly<Record<MapId, string>> = {
  [MapId.ORBITAL_09]: 'ORBITAL-09',
};
