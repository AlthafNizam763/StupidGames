import { createWorld, defaultSpawn, getLocalEntity, spawnEntity } from '../entities/World';
import { InputManager } from '../input/InputManager';
import { Renderer } from '../rendering/Renderer';
import { applyInput, stepEntity } from '../systems/MovementSystem';
import { GameLoop } from './GameLoop';
import type { EngineStats, World } from './types';

/**
 * The engine.
 *
 * Owns the world, the loop, input and rendering, and is the boundary React does
 * not cross. A component may call `start`, `stop`, `spawnLocalPlayer` or
 * `setStats` - it may not read a position, and nothing in here calls `setState`.
 *
 * That separation is the whole point of §41. React re-rendering at sixty frames
 * a second would spend more time diffing a tree than drawing the game, and on a
 * mid-range phone that is the difference between playable and not.
 *
 * The one channel back to React is `onStats`, sampled about once a second, for
 * a debug readout. Game events that the interface genuinely needs - a phase
 * change, an objective completing - arrive from the server over the socket, not
 * from this loop.
 */

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  /** Sampled roughly once per second. Never per frame. */
  onStats?: (stats: EngineStats) => void;
}

export class Engine {
  readonly world: World = createWorld();
  readonly input = new InputManager();
  readonly renderer = new Renderer();

  private readonly loop: GameLoop;
  private readonly canvas: HTMLCanvasElement;
  private readonly onStats: ((stats: EngineStats) => void) | undefined;
  private resizeObserver: ResizeObserver | null = null;
  private started = false;

  constructor(options: EngineOptions) {
    this.canvas = options.canvas;
    this.onStats = options.onStats;

    this.loop = new GameLoop({
      update: (dt) => this.update(dt),
      render: (alpha) => this.renderer.render(this.world, alpha),
      onStats: (fps, steps) =>
        this.onStats?.({ fps, steps, entities: this.world.entities.size }),
    });
  }

  start(): boolean {
    if (this.started) return true;
    if (!this.renderer.attach(this.canvas)) return false;

    this.started = true;
    this.input.attach();

    // Observe the element rather than listening for window resize: this also
    // catches a layout change that resizes the canvas without the window
    // changing, such as a HUD panel opening.
    this.resizeObserver = new ResizeObserver(() => this.syncSize());
    this.resizeObserver.observe(this.canvas);
    this.syncSize();

    document.addEventListener('visibilitychange', this.onVisibilityChange);

    this.loop.start();
    return true;
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;

    this.loop.stop();
    this.input.detach();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.renderer.detach();
  }

  /** Places the player this client controls and centres the camera on them. */
  spawnLocalPlayer(id: string, username: string, avatarId: string): void {
    const spawn = defaultSpawn(this.world);
    spawnEntity(this.world, { id, username, avatarId, ...spawn, isLocal: true });
    this.renderer.camera.snapTo(spawn);
  }

  applySettings(settings: { showPlayerNames: boolean; visualEffects: boolean }): void {
    this.renderer.showNames = settings.showPlayerNames;
    this.renderer.effectsEnabled = settings.visualEffects;
  }

  /* ---------------------------------------------------------- internals - */

  private update(dt: number): void {
    const local = getLocalEntity(this.world);

    if (local) {
      applyInput(local, this.input.read());
    }

    for (const entity of this.world.entities.values()) {
      stepEntity(entity, this.world, dt);
    }

    if (local) {
      this.renderer.camera.follow(local.position, dt, this.world);
    }
  }

  private syncSize(): void {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.renderer.resize(this.canvas, rect.width, rect.height);
    }
  }

  /**
   * A backgrounded tab stops receiving animation frames but `performance.now()`
   * keeps advancing. Without resetting the clock, returning would hand the loop
   * every second it slept at once.
   */
  private readonly onVisibilityChange = (): void => {
    if (!document.hidden) this.loop.resetClock();
  };
}
