import type { TaskType } from '@voidline/shared';
import { getLocalEntity } from '../entities/World';
import type { World } from './types';

/**
 * What the local player is standing near (§41 HUD affordances).
 *
 * IMPORTANT: this answers "what is nearby", not "what may I do". It reads only
 * public world state - positions, bodies, map geometry - and knows nothing about
 * roles, cooldowns or task assignment. A HUD built on it can show an affordance
 * the server then refuses, and that is the correct failure: the server decides,
 * and it is the only thing that does.
 *
 * Do not add role-dependent filtering here. This client does not reliably know
 * anyone's role - the only one it knows is its own, and that arrives on a
 * separate private channel precisely so it never has to be consulted by drawing
 * code.
 */

/** What to look for around the local player. Omitted kinds are not searched. */
export interface ProximityQuery {
  players?: boolean;
  bodies?: boolean;
  terminals?: boolean;
  repairStations?: boolean;
  /** Radius in world units. */
  within: number;
}

/** The closest candidate of each requested kind, or null if none is in range. */
export interface ProximityResult {
  player: { id: string; username: string; distance: number } | null;
  body: { id: string; distance: number } | null;
  terminal: { id: string; type: TaskType; distance: number } | null;
  repairStation: { id: string; distance: number } | null;
}

function squaredDistance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function nearestTo(world: World, query: ProximityQuery): ProximityResult {
  const result: ProximityResult = {
    player: null,
    body: null,
    terminal: null,
    repairStation: null,
  };

  const local = getLocalEntity(world);
  if (!local) return result;

  const { x, y } = local.position;
  // Compared squared throughout; the square root is taken once per winner.
  const limit = query.within * query.within;

  let bestPlayer = limit;
  let bestBody = limit;
  let bestTerminal = limit;
  let bestStation = limit;

  if (query.players) {
    for (const entity of world.entities.values()) {
      // Never yourself, and never a corpse - the dead are drawn as ghosts to
      // other ghosts, and are not something to walk up to.
      if (entity.isLocal || !entity.alive) continue;

      const distance = squaredDistance(x, y, entity.position.x, entity.position.y);
      if (distance < bestPlayer) {
        bestPlayer = distance;
        result.player = {
          id: entity.id,
          username: entity.username,
          distance: Math.sqrt(distance),
        };
      }
    }
  }

  if (query.bodies) {
    for (const body of world.bodies) {
      // A body already reported has had its council. Offering it again
      // produces a refusal the player cannot act on.
      if (body.reported) continue;

      const distance = squaredDistance(x, y, body.position.x, body.position.y);
      if (distance < bestBody) {
        bestBody = distance;
        result.body = { id: body.id, distance: Math.sqrt(distance) };
      }
    }
  }

  const map = world.map;

  if (query.terminals && map) {
    for (const terminal of map.terminals) {
      const distance = squaredDistance(x, y, terminal.position.x, terminal.position.y);
      if (distance < bestTerminal) {
        bestTerminal = distance;
        result.terminal = {
          id: terminal.id,
          type: terminal.type,
          distance: Math.sqrt(distance),
        };
      }
    }
  }

  if (query.repairStations && map) {
    for (const station of map.repairStations) {
      const distance = squaredDistance(x, y, station.position.x, station.position.y);
      if (distance < bestStation) {
        bestStation = distance;
        result.repairStation = { id: station.id, distance: Math.sqrt(distance) };
      }
    }
  }

  return result;
}
