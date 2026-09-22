import type { AnimationState, Facing, Vec2 } from '@voidline/shared';

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
  /** Rectangular world bounds. Phase 10 replaces this with the real map. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Static obstacles. Populated from map data in Phase 10. */
  obstacles: Rect[];
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
