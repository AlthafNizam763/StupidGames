import type { Vec2 } from '@voidline/shared';
import type { World } from '../engine/types';

/**
 * The camera.
 *
 * Follows a target with damping rather than locking to it. A camera pinned
 * exactly to the player transmits every small correction straight into the
 * viewport, which reads as jitter; easing absorbs that while staying tight
 * enough to feel responsive.
 */
export class Camera {
  readonly position: Vec2 = { x: 0, y: 0 };

  /** World units visible across the smaller screen axis. */
  private viewHeight = 600;
  private viewportWidth = 1;
  private viewportHeight = 1;
  scale = 1;

  /**
   * Fraction of the remaining distance covered per second.
   *
   * High enough that the camera never visibly lags a sprinting player, low
   * enough to smooth a correction.
   */
  private readonly followStrength = 12;

  setViewport(width: number, height: number): void {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);

    /*
     * Scale from the *smaller* axis so a phone in portrait and a desktop in
     * landscape see a comparable amount of the world. Scaling from width would
     * give a wide monitor an enormous tactical advantage - being able to see
     * players nobody else can is not a cosmetic difference in a game about
     * who saw whom (§38).
     */
    const reference = Math.min(this.viewportWidth, this.viewportHeight);
    this.scale = reference / this.viewHeight;
  }

  /** Jumps to a position with no easing. Used on spawn and after a teleport. */
  snapTo(target: Vec2): void {
    this.position.x = target.x;
    this.position.y = target.y;
  }

  follow(target: Vec2, dt: number, world: World): void {
    /*
     * Exponential damping, framerate independent. A naive `pos += (target -
     * pos) * k` moves further per second at 120fps than at 30, so the camera
     * would feel different on different hardware.
     */
    const t = 1 - Math.exp(-this.followStrength * dt);
    this.position.x += (target.x - this.position.x) * t;
    this.position.y += (target.y - this.position.y) * t;

    this.clampToBounds(world);
  }

  /**
   * Keeps the view inside the world.
   *
   * When the world is smaller than the viewport on an axis, the camera centres
   * on it instead - otherwise clamping would push the view off the map edge.
   */
  private clampToBounds(world: World): void {
    const halfWidth = this.viewportWidth / (2 * this.scale);
    const halfHeight = this.viewportHeight / (2 * this.scale);

    const worldWidth = world.bounds.maxX - world.bounds.minX;
    const worldHeight = world.bounds.maxY - world.bounds.minY;

    if (worldWidth <= halfWidth * 2) {
      this.position.x = (world.bounds.minX + world.bounds.maxX) / 2;
    } else {
      this.position.x = clamp(
        this.position.x,
        world.bounds.minX + halfWidth,
        world.bounds.maxX - halfWidth,
      );
    }

    if (worldHeight <= halfHeight * 2) {
      this.position.y = (world.bounds.minY + world.bounds.maxY) / 2;
    } else {
      this.position.y = clamp(
        this.position.y,
        world.bounds.minY + halfHeight,
        world.bounds.maxY - halfHeight,
      );
    }
  }

  /** True when a circle at this world position could be on screen. */
  isVisible(x: number, y: number, radius: number): boolean {
    const halfWidth = this.viewportWidth / (2 * this.scale) + radius;
    const halfHeight = this.viewportHeight / (2 * this.scale) + radius;
    return (
      Math.abs(x - this.position.x) <= halfWidth && Math.abs(y - this.position.y) <= halfHeight
    );
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
