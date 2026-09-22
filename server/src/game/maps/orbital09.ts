import {
  MapId,
  TaskType,
  ZONE_LABELS,
  ZoneId,
  type MapData,
  type MapRepairStation,
  type MapSpawn,
  type MapTerminal,
  type MapWall,
  type MapZone,
} from '@voidline/shared';
import { buildHullWalls, buildRoomWalls, type RoomSpec } from './geometry';

/**
 * ORBITAL-09.
 *
 * An original station layout authored for this project (§14, §47).
 *
 * Shape: three decks of rooms inside a rectangular hull, with the space
 * *between* rooms forming the corridors. Nothing declares a corridor - the gaps
 * are the corridors. That keeps the layout to ten rectangles a person can
 * check, and means widening a corridor is a matter of moving a room rather than
 * re-cutting a corridor mesh.
 *
 * Layout intent, which matters for how the game plays:
 *
 * - **A loop, not a tree.** Every room has at least two ways in, so nobody is
 *   ever cornered in a dead end, and "I saw them go in and nobody came out" is
 *   a claim that can be wrong. A social deduction map with dead ends turns
 *   every encounter into a certainty.
 * - **Reactor Core and Engine Room sit far apart**, on opposite ends of the
 *   lower deck. A critical sabotage needs two repair stations (SABOTAGE_RULES),
 *   so the Operators have to split up - which is when a Saboteur gets to work.
 * - **Security and Command Deck are adjacent, up top.** The two rooms with the
 *   most information are near each other and far from Reactor Core, so watching
 *   the station and fixing it are competing choices.
 * - **Cargo Bay is a corner room with one long approach**, the riskiest place
 *   to be caught alone, and the map's only near-dead-end - it has a second door
 *   onto the east corridor precisely so it is risky rather than fatal.
 */

const HULL = { x: 0, y: 0, width: 2600, height: 1700 };

/**
 * Room interiors. Walls are generated outside these, so these are exactly the
 * space a player can stand in.
 *
 * The gaps between them - 100 units vertically, 120 horizontally - are the
 * corridors. Wide enough for two players to pass, tight enough that walking
 * into someone is an event.
 */
const ROOMS: Array<{ id: ZoneId; spec: RoomSpec }> = [
  /* ---------------------------------------------------- upper deck - */
  {
    id: ZoneId.COMMAND_DECK,
    spec: {
      bounds: { x: 180, y: 160, width: 520, height: 340 },
      doors: [
        { side: 'south', offset: 200, width: 120 },
        { side: 'east', offset: 120, width: 110 },
      ],
    },
  },
  {
    id: ZoneId.OBSERVATORY,
    spec: {
      bounds: { x: 820, y: 160, width: 500, height: 340 },
      doors: [
        { side: 'south', offset: 190, width: 120 },
        { side: 'west', offset: 120, width: 110 },
      ],
    },
  },
  {
    id: ZoneId.SECURITY,
    spec: {
      bounds: { x: 1440, y: 160, width: 480, height: 340 },
      doors: [
        { side: 'south', offset: 180, width: 120 },
        { side: 'east', offset: 120, width: 110 },
      ],
    },
  },
  {
    id: ZoneId.CARGO_BAY,
    spec: {
      bounds: { x: 2040, y: 160, width: 420, height: 560 },
      doors: [
        { side: 'south', offset: 150, width: 130 },
        { side: 'west', offset: 120, width: 110 },
      ],
    },
  },

  /* ----------------------------------------------------- mid deck - */
  {
    id: ZoneId.COMMUNICATIONS,
    spec: {
      bounds: { x: 180, y: 620, width: 460, height: 340 },
      doors: [
        { side: 'north', offset: 180, width: 120 },
        { side: 'east', offset: 120, width: 110 },
        { side: 'south', offset: 180, width: 120 },
      ],
    },
  },
  {
    id: ZoneId.MEDICAL_BAY,
    spec: {
      bounds: { x: 760, y: 620, width: 440, height: 340 },
      doors: [
        { side: 'north', offset: 170, width: 120 },
        { side: 'west', offset: 120, width: 110 },
        { side: 'east', offset: 120, width: 110 },
      ],
    },
  },
  {
    id: ZoneId.RESEARCH_LAB,
    spec: {
      bounds: { x: 1320, y: 620, width: 440, height: 340 },
      doors: [
        { side: 'north', offset: 170, width: 120 },
        { side: 'west', offset: 120, width: 110 },
        { side: 'south', offset: 170, width: 120 },
      ],
    },
  },

  /* ---------------------------------------------------- lower deck - */
  {
    id: ZoneId.REACTOR_CORE,
    spec: {
      bounds: { x: 180, y: 1100, width: 520, height: 360 },
      doors: [
        { side: 'north', offset: 200, width: 120 },
        { side: 'east', offset: 130, width: 110 },
      ],
    },
  },
  {
    id: ZoneId.HYDROPONICS,
    spec: {
      bounds: { x: 820, y: 1100, width: 500, height: 360 },
      doors: [
        { side: 'north', offset: 190, width: 120 },
        { side: 'west', offset: 130, width: 110 },
        { side: 'east', offset: 130, width: 110 },
      ],
    },
  },
  {
    id: ZoneId.ENGINE_ROOM,
    spec: {
      bounds: { x: 1440, y: 1100, width: 480, height: 360 },
      doors: [
        { side: 'north', offset: 180, width: 120 },
        { side: 'west', offset: 130, width: 110 },
        { side: 'east', offset: 130, width: 110 },
      ],
    },
  },
];

const zones: MapZone[] = ROOMS.map((room) => ({
  id: room.id,
  label: ZONE_LABELS[room.id],
  bounds: room.spec.bounds,
}));

const walls: MapWall[] = [
  ...buildHullWalls(HULL),
  ...ROOMS.flatMap((room) => buildRoomWalls(room.spec)),
];

/** The centre of a room, as a convenient anchor. */
function centreOf(id: ZoneId): { x: number; y: number } {
  const zone = zones.find((candidate) => candidate.id === id);
  if (!zone) throw new Error(`ORBITAL-09 has no zone ${id}`);
  return {
    x: zone.bounds.x + zone.bounds.width / 2,
    y: zone.bounds.y + zone.bounds.height / 2,
  };
}

/**
 * Spawn points, spread along the mid-deck corridor.
 *
 * Everyone starts in the open rather than inside a room: a match that begins
 * with two players already alone together in Cargo Bay has handed the Saboteur
 * a free elimination before anyone has moved.
 */
const spawns: MapSpawn[] = Array.from({ length: 15 }, (_, index) => ({
  // Two staggered rows across the central corridor, so fifteen players are not
  // stacked on one point.
  x: 320 + (index % 8) * 230,
  y: index < 8 ? 1020 : 1050,
  zone: ZoneId.CORRIDOR,
}));

/**
 * Objective terminals, one per objective type, each in the room its work
 * belongs to (§18).
 *
 * Placed away from doors so that using one puts a player's back to the room
 * rather than to the corridor - being interruptible is the point.
 */
const terminals: MapTerminal[] = [
  {
    id: 'term-reactor-calibration',
    type: TaskType.REACTOR_CALIBRATION,
    zone: ZoneId.REACTOR_CORE,
    position: { x: centreOf(ZoneId.REACTOR_CORE).x - 140, y: centreOf(ZoneId.REACTOR_CORE).y },
  },
  {
    id: 'term-signal-routing',
    type: TaskType.SIGNAL_ROUTING,
    zone: ZoneId.COMMUNICATIONS,
    position: { x: centreOf(ZoneId.COMMUNICATIONS).x, y: centreOf(ZoneId.COMMUNICATIONS).y + 100 },
  },
  {
    id: 'term-oxygen-balancing',
    type: TaskType.OXYGEN_BALANCING,
    zone: ZoneId.HYDROPONICS,
    position: { x: centreOf(ZoneId.HYDROPONICS).x, y: centreOf(ZoneId.HYDROPONICS).y + 110 },
  },
  {
    id: 'term-data-recovery',
    type: TaskType.DATA_RECOVERY,
    zone: ZoneId.RESEARCH_LAB,
    position: { x: centreOf(ZoneId.RESEARCH_LAB).x + 130, y: centreOf(ZoneId.RESEARCH_LAB).y },
  },
  {
    id: 'term-power-sync',
    type: TaskType.POWER_SYNCHRONIZATION,
    zone: ZoneId.ENGINE_ROOM,
    position: { x: centreOf(ZoneId.ENGINE_ROOM).x, y: centreOf(ZoneId.ENGINE_ROOM).y + 110 },
  },
  {
    id: 'term-security-scan',
    type: TaskType.SECURITY_SCAN,
    zone: ZoneId.SECURITY,
    position: { x: centreOf(ZoneId.SECURITY).x + 140, y: centreOf(ZoneId.SECURITY).y },
  },
  {
    id: 'term-navigation',
    type: TaskType.NAVIGATION_CALIBRATION,
    zone: ZoneId.COMMAND_DECK,
    position: { x: centreOf(ZoneId.COMMAND_DECK).x - 150, y: centreOf(ZoneId.COMMAND_DECK).y },
  },
  // Two more so there is somewhere to send players who are not needed at a
  // one-of-a-kind terminal.
  {
    id: 'term-medical-scan',
    type: TaskType.SECURITY_SCAN,
    zone: ZoneId.MEDICAL_BAY,
    position: { x: centreOf(ZoneId.MEDICAL_BAY).x - 130, y: centreOf(ZoneId.MEDICAL_BAY).y },
  },
  {
    id: 'term-cargo-data',
    type: TaskType.DATA_RECOVERY,
    zone: ZoneId.CARGO_BAY,
    position: { x: centreOf(ZoneId.CARGO_BAY).x, y: centreOf(ZoneId.CARGO_BAY).y + 180 },
  },
];

/**
 * Repair stations for critical sabotage.
 *
 * Reactor and Engine Room are at opposite ends of the lower deck on purpose: a
 * reactor breach needs both worked, so the crew must split, and splitting is
 * what makes a sabotage dangerous beyond its timer.
 */
const repairStations: MapRepairStation[] = [
  {
    id: 'repair-reactor-a',
    zone: ZoneId.REACTOR_CORE,
    position: { x: centreOf(ZoneId.REACTOR_CORE).x + 150, y: centreOf(ZoneId.REACTOR_CORE).y - 90 },
  },
  {
    id: 'repair-reactor-b',
    zone: ZoneId.ENGINE_ROOM,
    position: { x: centreOf(ZoneId.ENGINE_ROOM).x - 150, y: centreOf(ZoneId.ENGINE_ROOM).y - 90 },
  },
  {
    id: 'repair-oxygen-a',
    zone: ZoneId.HYDROPONICS,
    position: { x: centreOf(ZoneId.HYDROPONICS).x - 160, y: centreOf(ZoneId.HYDROPONICS).y - 100 },
  },
  {
    id: 'repair-oxygen-b',
    zone: ZoneId.COMMAND_DECK,
    position: { x: centreOf(ZoneId.COMMAND_DECK).x + 160, y: centreOf(ZoneId.COMMAND_DECK).y + 90 },
  },
  {
    id: 'repair-comms',
    zone: ZoneId.COMMUNICATIONS,
    position: { x: centreOf(ZoneId.COMMUNICATIONS).x - 150, y: centreOf(ZoneId.COMMUNICATIONS).y },
  },
  {
    id: 'repair-power',
    zone: ZoneId.SECURITY,
    position: { x: centreOf(ZoneId.SECURITY).x - 150, y: centreOf(ZoneId.SECURITY).y + 90 },
  },
];

export const ORBITAL_09: MapData = {
  id: MapId.ORBITAL_09,
  label: 'ORBITAL-09',
  bounds: HULL,
  zones,
  walls,
  spawns,
  terminals,
  repairStations,
  version: 1,
};
