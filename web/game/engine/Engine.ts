import { createWorld, getLocalEntity, loadMap, spawnEntity, spawnPointFor, zoneAt } from '../entities/World';
import { InputManager } from '../input/InputManager';
import { Renderer } from '../rendering/Renderer';
import { applyInput, stepEntity } from '../systems/MovementSystem';
import { NetworkSync } from '../systems/NetworkSync';
import { GameLoop } from './GameLoop';
import type { EngineStats, World } from './types';
import { nearestTo, type ProximityQuery, type ProximityResult } from './proximity';
import type { GameSnapshot, MapData, MovementDelta, ZoneId } from '@voidline/shared';

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
  readonly network = new NetworkSync();

  /**
   * Where movement intent goes.
   *
   * Set by the React bridge to the socket emitter. Null in the engine preview,
   * where the loop runs with no server - which is why this is optional rather
   * than a constructor dependency.
   */
  private sendInput: ((payload: unknown) => void) | null = null;

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

  /**
   * Loads the server-authored map.
   *
   * Safe to call after the loop has started: the world is usable while the map
   * request is in flight, and this fills it in when the data arrives. Any
   * player already spawned is moved to a real spawn point, since the fallback
   * they were given was the centre of an empty world.
   */
  loadMap(map: MapData): void {
    loadMap(this.world, map);

    const local = getLocalEntity(this.world);
    if (local) {
      const spawn = spawnPointFor(this.world, 0);
      local.position.x = spawn.x;
      local.position.y = spawn.y;
      local.previous.x = spawn.x;
      local.previous.y = spawn.y;
      local.render.x = spawn.x;
      local.render.y = spawn.y;
      this.renderer.camera.snapTo(spawn);
    }
  }

  /** Places the player this client controls and centres the camera on them. */
  spawnLocalPlayer(id: string, username: string, avatarId: string): void {
    const spawn = spawnPointFor(this.world, 0);
    spawnEntity(this.world, { id, username, avatarId, ...spawn, isLocal: true });
    this.renderer.camera.snapTo(spawn);
  }

  /** The room the local player is standing in, for the HUD. */
  localZone(): ZoneId | null {
    const local = getLocalEntity(this.world);
    return local ? zoneAt(this.world, local.position.x, local.position.y) : null;
  }

  /**
   * What the local player is standing near (§41 HUD affordances).
   *
   * A *pull* API, on purpose. The HUD needs to know when to light up "Use" or
   * "Report", and the alternative - the engine pushing proximity into React -
   * would mean a setState from inside the loop, which is exactly what the
   * engine/React boundary exists to prevent. Call it on a timer at a few
   * hertz; a button appearing 200ms after you walk up to a terminal is
   * imperceptible, and sixty React renders a second is not.
   *
   * See proximity.ts for what this deliberately does not know.
   */
  nearest(query: ProximityQuery): ProximityResult {
    return nearestTo(this.world, query);
  }

  /** Connects the engine to the network. Without it the engine runs offline. */
  setInputSender(send: ((payload: unknown) => void) | null): void {
    this.sendInput = send;
  }

  /** Applies a full server snapshot. */
  applySnapshot(snapshot: GameSnapshot, localId: string | null): void {
    this.network.applySnapshot(this.world, snapshot, localId);
  }

  /** Applies a positional delta. Called ten times a second, outside React. */
  applyDelta(delta: MovementDelta, localId: string | null): void {
    this.network.applyDelta(this.world, delta, localId);
  }

  applySettings(settings: { showPlayerNames: boolean; visualEffects: boolean }): void {
    this.renderer.showNames = settings.showPlayerNames;
    this.renderer.effectsEnabled = settings.visualEffects;
  }

  /* ---------------------------------------------------------- internals - */

  private update(dt: number): void {
    const local = getLocalEntity(this.world);
    const snapshot = this.input.read();

    if (local) {
      applyInput(local, snapshot);

      /*
       * Intent goes to the server at a fixed rate, not per tick. The server
       * integrates it; this client predicts the same motion locally so the
       * player moves on keypress rather than after a round trip.
       */
      const payload = this.network.buildInput(snapshot, performance.now());
      if (payload && this.sendInput) this.sendInput(payload);

      // Only the local player is simulated here. Remote players are
      // interpolated toward server positions instead - their input is not
      // known, so predicting them would be inventing it.
      stepEntity(local, this.world, dt);
      this.renderer.camera.follow(local.position, dt, this.world);
    }

    this.network.interpolateRemotes(this.world, dt);
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
