import type { AnimationState, DeadBody, Facing, MapData, MapZone, Vec2 } from '@voidline/shared';
import type { SpatialGrid } from '../collision/SpatialGrid';

/**
 * Engine types.
 *
 * Everything here is *mutable and plain*. No class instances with behaviour, no
 * immutable updates, no React state. The simulation runs sixty times a second
 * and allocating a new object per entity per tick is how a game starts dropping
 * frames on the phones it most needs to run on.
 *
 * These are deliberately separate from the shared wire types. `PublicPlayerState`
 * describes what the server broadcasts; `Entity` describes what this client is
 * drawing, including things the server never sends - interpolation buffers,
 * render positions, animation timers.
 */

export interface Entity {
  id: string;
  /** Authoritative position: where the simulation says this entity is. */
  position: Vec2;
  /** Velocity in world units per second. */
  velocity: Vec2;
  /**
   * Where to draw, this frame.
   *
   * Distinct from `position` because rendering runs at display rate while the
   * simulation runs at a fixed rate; this is the interpolated value between the
   * previous and current simulation states.
   */
  render: Vec2;
  /** Position at the end of the previous simulation tick, for interpolation. */
  previous: Vec2;
  radius: number;
  facing: Facing;
  animation: AnimationState;
  /** Seconds accumulated in the current animation, for cycling frames. */
  animationTime: number;
  alive: boolean;
  /** Suit colour, from the shared avatar palette. */
  colour: string;
  username: string;
  /** True for the entity this client controls. */
  isLocal: boolean;
}

/**
 * The whole mutable world.
 *
 * A single object the loop reads and writes in place. React never sees it: the
 * store is told about *events* (a phase change, an objective completing), never
 * about positions.
 */
export interface World {
  entities: Map<string, Entity>;
  localId: string | null;
  /**
   * Bodies awaiting report, exactly as the last snapshot listed them.
   *
   * Replaced wholesale rather than merged: the server decides which bodies
   * exist and which have been reported, and a body that vanishes from the
   * snapshot has been cleared by a council. Keeping a local copy alive past
   * that would let a player report a body twice.
   *
   * Held as server state rather than as entities because they do not move, are
   * not interpolated, and are not simulated - they are a list of coordinates.
   */
  bodies: DeadBody[];
  /** Outer hull. Nothing leaves it. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Solid geometry, from the server-authored map. */
  obstacles: Rect[];
  /** Named rooms, for labels and zone reporting. */
  zones: MapZone[];
  /**
   * Broadphase over `obstacles`. Built once when the map loads.
   *
   * Null until a map is loaded, so the engine can run - and render an empty
   * hull - while the map request is still in flight.
   */
  grid: SpatialGrid | null;
  /** The map this world was built from, if any. */
  map: MapData | null;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the input layer produces each frame, whatever the device. */
export interface InputSnapshot {
  /** Normalised direction. Zero-length means no movement requested. */
  direction: Vec2;
  /** 0-1. A joystick can push gently; a key is always 1. */
  magnitude: number;
  interact: boolean;
  action: boolean;
}

export interface EngineStats {
  fps: number;
  /** Simulation steps run in the last frame. Above 1 means catching up. */
  steps: number;
  entities: number;
}
