import { AnimationState } from '@voidline/shared';
import type { Entity, World } from '../engine/types';
import { Camera } from './Camera';

/**
 * Canvas rendering.
 *
 * Owns the 2D context and draws the world. It reads entity state and never
 * writes it - the simulation decides where things are, this decides what that
 * looks like. Keeping the two apart is what makes it possible to change the art
 * without touching movement, and to fix movement without breaking the art.
 *
 * Nothing here allocates per frame beyond what the canvas API forces. Colours
 * are precomputed strings, the path for a wall is rebuilt from numbers already
 * in memory, and there are no intermediate arrays.
 */

/** Device pixel ratio, capped. */
const MAX_DPR = 2;

export class Renderer {
  readonly camera = new Camera();

  private ctx: CanvasRenderingContext2D | null = null;
  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;

  /** Set from the player's settings. Off skips the decorative passes. */
  effectsEnabled = true;
  showNames = true;

  attach(canvas: HTMLCanvasElement): boolean {
    const ctx = canvas.getContext('2d', {
      // The canvas fills the viewport over an opaque background, so the
      // compositor never needs to blend it with anything underneath.
      alpha: false,
      desynchronized: true,
    });
    if (!ctx) return false;

    this.ctx = ctx;
    return true;
  }

  detach(): void {
    this.ctx = null;
  }

  /**
   * Sizes the backing store to the display.
   *
   * A canvas has two sizes: its CSS box and its pixel buffer. Leaving the
   * buffer at the CSS size renders at one device pixel per CSS pixel, which on
   * a phone at DPR 3 is visibly soft.
   *
   * The ratio is capped at 2. Beyond that the pixel count grows quadratically
   * for a difference almost nobody can see, and a 3x phone would be shading
   * nine times the pixels of a 1x display - exactly the device that can least
   * afford it.
   */
  resize(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;

    const bufferWidth = Math.max(1, Math.round(cssWidth * this.dpr));
    const bufferHeight = Math.max(1, Math.round(cssHeight * this.dpr));

    // Assigning width or height clears the canvas and resets the context, so
    // only do it when the size actually changed.
    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
      canvas.width = bufferWidth;
      canvas.height = bufferHeight;
    }

    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    this.camera.setViewport(cssWidth, cssHeight);
  }

  render(world: World, alpha: number): void {
    const ctx = this.ctx;
    if (!ctx) return;

    // Interpolate every entity toward its latest simulated position. This is
    // what makes 60Hz simulation look smooth on a 120Hz display.
    for (const entity of world.entities.values()) {
      entity.render.x = entity.previous.x + (entity.position.x - entity.previous.x) * alpha;
      entity.render.y = entity.previous.y + (entity.position.y - entity.previous.y) * alpha;
    }

    ctx.save();
    // One transform for device pixels, then one for the camera. Everything
    // below draws in world coordinates.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    ctx.fillStyle = '#05070c';
    ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);

    ctx.translate(this.cssWidth / 2, this.cssHeight / 2);
    ctx.scale(this.camera.scale, this.camera.scale);
    ctx.translate(-this.camera.position.x, -this.camera.position.y);

    this.drawFloor(ctx, world);
    this.drawZones(ctx, world);
    this.drawTerminals(ctx, world);
    this.drawObstacles(ctx, world);
    this.drawZoneLabels(ctx, world);
    this.drawEntities(ctx, world);

    ctx.restore();
  }

  /* --------------------------------------------------------- passes - */

  /**
   * The deck plating.
   *
   * Drawn as a grid clipped to the visible area rather than the whole world:
   * the loop is over screen space, so the cost is constant however large the
   * map becomes.
   */
  private drawFloor(ctx: CanvasRenderingContext2D, world: World): void {
    const cell = 64;
    const halfWidth = this.cssWidth / (2 * this.camera.scale);
    const halfHeight = this.cssHeight / (2 * this.camera.scale);

    const left = Math.max(world.bounds.minX, this.camera.position.x - halfWidth);
    const right = Math.min(world.bounds.maxX, this.camera.position.x + halfWidth);
    const top = Math.max(world.bounds.minY, this.camera.position.y - halfHeight);
    const bottom = Math.min(world.bounds.maxY, this.camera.position.y + halfHeight);

    ctx.fillStyle = '#0a0e16';
    ctx.fillRect(
      world.bounds.minX,
      world.bounds.minY,
      world.bounds.maxX - world.bounds.minX,
      world.bounds.maxY - world.bounds.minY,
    );

    ctx.strokeStyle = '#141b27';
    ctx.lineWidth = 1 / this.camera.scale;
    ctx.beginPath();

    // One path for every line, stroked once. Stroking per line would be
    // hundreds of separate draw calls a frame.
    for (let x = Math.floor(left / cell) * cell; x <= right; x += cell) {
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
    }
    for (let y = Math.floor(top / cell) * cell; y <= bottom; y += cell) {
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
    }
    ctx.stroke();

    ctx.strokeStyle = '#2a3547';
    ctx.lineWidth = 3 / this.camera.scale;
    ctx.strokeRect(
      world.bounds.minX,
      world.bounds.minY,
      world.bounds.maxX - world.bounds.minX,
      world.bounds.maxY - world.bounds.minY,
    );
  }

  /**
   * Room floors.
   *
   * Drawn a shade lighter than the corridors so a player can tell at a glance
   * whether they are inside a room or in the open - which matters, because
   * "where were you" is the question the whole game turns on.
   */
  private drawZones(ctx: CanvasRenderingContext2D, world: World): void {
    ctx.fillStyle = '#0f1520';

    for (const zone of world.zones) {
      const { x, y, width, height } = zone.bounds;
      if (!this.camera.isVisible(x + width / 2, y + height / 2, Math.max(width, height))) continue;
      ctx.fillRect(x, y, width, height);
    }
  }

  /**
   * Objective terminals and repair stations.
   *
   * Markers only at this stage: the objectives themselves are Phase 13. They
   * are drawn because a map with nothing in its rooms reads as unfinished, and
   * because their placement is the thing worth being able to see and judge.
   */
  private drawTerminals(ctx: CanvasRenderingContext2D, world: World): void {
    const map = world.map;
    if (!map) return;

    for (const terminal of map.terminals) {
      if (!this.camera.isVisible(terminal.position.x, terminal.position.y, 24)) continue;

      ctx.fillStyle = '#1d2635';
      ctx.strokeStyle = '#3fe0bc';
      ctx.lineWidth = 2 / this.camera.scale;
      ctx.beginPath();
      ctx.roundRect(terminal.position.x - 16, terminal.position.y - 12, 32, 24, 5);
      ctx.fill();
      ctx.stroke();
    }

    for (const station of map.repairStations) {
      if (!this.camera.isVisible(station.position.x, station.position.y, 24)) continue;

      ctx.fillStyle = '#1d2635';
      ctx.strokeStyle = '#ffc15e';
      ctx.lineWidth = 2 / this.camera.scale;
      ctx.beginPath();
      ctx.arc(station.position.x, station.position.y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  /**
   * Room names, at a fixed pixel size.
   *
   * Scaled inversely to the camera so a label stays readable rather than
   * growing and shrinking with the zoom, and skipped entirely when the room is
   * off screen.
   */
  private drawZoneLabels(ctx: CanvasRenderingContext2D, world: World): void {
    const inverse = 1 / this.camera.scale;

    ctx.font = '700 12px "Space Grotesk", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const zone of world.zones) {
      const centreX = zone.bounds.x + zone.bounds.width / 2;
      const centreY = zone.bounds.y + zone.bounds.height / 2;
      if (!this.camera.isVisible(centreX, centreY, Math.max(zone.bounds.width, zone.bounds.height)))
        continue;

      ctx.save();
      ctx.translate(centreX, centreY);
      ctx.scale(inverse, inverse);

      const label = zone.label.toUpperCase();
      ctx.letterSpacing = '2px';
      ctx.fillStyle = 'rgba(102,116,137,0.55)';
      ctx.fillText(label, 0, 0);

      ctx.restore();
    }

    ctx.letterSpacing = '0px';
  }

  private drawObstacles(ctx: CanvasRenderingContext2D, world: World): void {
    ctx.fillStyle = '#141b27';
    ctx.strokeStyle = '#2a3547';
    ctx.lineWidth = 2 / this.camera.scale;

    for (const rect of world.obstacles) {
      // Skip anything off screen. With the real map this is the difference
      // between drawing a room and drawing a station.
      if (
        !this.camera.isVisible(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
          Math.max(rect.width, rect.height),
        )
      ) {
        continue;
      }
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    }
  }

  private drawEntities(ctx: CanvasRenderingContext2D, world: World): void {
    for (const entity of world.entities.values()) {
      if (!this.camera.isVisible(entity.render.x, entity.render.y, entity.radius * 3)) continue;
      this.drawOperator(ctx, entity);
    }
  }

  /**
   * One Operator.
   *
   * The same silhouette as the avatar component - domed helmet, wide visor,
   * shoulder yoke - so a player recognises on the map the suit they picked in
   * their profile.
   */
  private drawOperator(ctx: CanvasRenderingContext2D, entity: Entity): void {
    const { x, y } = entity.render;
    const r = entity.radius;

    ctx.save();
    ctx.translate(x, y);

    // A walk cycle expressed as a small vertical bob. Cheap, and enough to
    // read as movement without a sprite sheet.
    const bob =
      entity.animation === AnimationState.WALK
        ? Math.sin(entity.animationTime * 12) * r * 0.08
        : 0;

    if (!entity.alive) ctx.globalAlpha = 0.45;

    if (this.effectsEnabled && entity.alive) {
      // Contact shadow. Grounds the figure so it does not look pasted on.
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, r * 0.85, r * 0.75, r * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.translate(0, bob);
    // Mirror horizontally to face the other way, rather than drawing twice.
    if (entity.facing === 'LEFT') ctx.scale(-1, 1);

    // Yoke.
    ctx.fillStyle = entity.colour;
    ctx.beginPath();
    ctx.roundRect(-r * 0.8, r * 0.05, r * 1.6, r * 0.85, r * 0.35);
    ctx.fill();

    // Helmet.
    ctx.beginPath();
    ctx.arc(0, -r * 0.25, r * 0.82, 0, Math.PI * 2);
    ctx.fill();

    // Visor.
    ctx.fillStyle = '#05070c';
    ctx.beginPath();
    ctx.ellipse(r * 0.12, -r * 0.28, r * 0.55, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();

    // Highlight.
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.05, -r * 0.42, r * 0.2, r * 0.14, -0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    if (this.showNames && entity.alive) {
      ctx.save();
      ctx.translate(x, y);
      // Names are drawn at a fixed pixel size regardless of zoom, so they stay
      // legible rather than scaling with the world.
      const inverse = 1 / this.camera.scale;
      ctx.scale(inverse, inverse);

      ctx.font = '600 13px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const label = entity.username;
      const labelY = -(r + 10) * this.camera.scale;

      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(5,7,12,0.85)';
      ctx.strokeText(label, 0, labelY);
      ctx.fillStyle = entity.isLocal ? '#3fe0bc' : '#e8edf7';
      ctx.fillText(label, 0, labelY);

      ctx.restore();
    }
  }
}
