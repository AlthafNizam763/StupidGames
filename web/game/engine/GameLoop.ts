/**
 * The game loop.
 *
 * Fixed-timestep simulation, variable-rate rendering.
 *
 * Why not simply simulate once per animation frame: frame intervals vary. A
 * phone that drops to 30fps would integrate with a delta twice as large, and
 * collision resolved against a doubled step lets a player pass through a wall.
 * Worse, the same input would produce different movement on different hardware,
 * which in a game where the server also simulates means constant correction.
 *
 * So the simulation advances in identical slices. The renderer draws between
 * them, using `alpha` to interpolate - which is what keeps motion smooth on a
 * 120Hz display even though the simulation only runs at 60.
 *
 * The accumulator is capped. After a long stall - a backgrounded tab, a garbage
 * collection pause - the honest amount of time to catch up on could be seconds,
 * and running hundreds of steps to get there would freeze the page far longer
 * than the stall did. Time is dropped instead; the server is authoritative, so
 * the next snapshot corrects anything that matters.
 */

/** Simulation rate. Matches the server's tick so both integrate identically. */
export const FIXED_TIMESTEP_MS = 1000 / 60;

/** Never run more than this many steps in one frame. */
const MAX_STEPS_PER_FRAME = 5;

export interface LoopCallbacks {
  /** Advances the simulation by exactly `dt` seconds. */
  update: (dt: number) => void;
  /**
   * Draws one frame.
   *
   * `alpha` is how far the current moment sits between the previous simulation
   * state and the latest one, 0 to 1.
   */
  render: (alpha: number) => void;
  /** Called about once a second with sampled statistics. */
  onStats?: (fps: number, steps: number) => void;
}

export class GameLoop {
  private rafId: number | null = null;
  private running = false;
  private lastTime = 0;
  private accumulator = 0;
  private stepsThisFrame = 0;

  private frameCount = 0;
  private fpsWindowStart = 0;

  constructor(private readonly callbacks: LoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;

    this.lastTime = performance.now();
    this.fpsWindowStart = this.lastTime;
    this.accumulator = 0;
    this.frameCount = 0;

    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * Discards accumulated time without simulating it.
   *
   * Called when the tab becomes visible again: `performance.now()` kept
   * advancing while the tab slept, and the elapsed time is real but simulating
   * it would teleport everything. The server's next snapshot is the truth.
   */
  resetClock(): void {
    this.lastTime = performance.now();
    this.accumulator = 0;
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;

    // Scheduled first, so an exception below does not silently kill the loop.
    this.rafId = requestAnimationFrame(this.frame);

    const elapsed = now - this.lastTime;
    this.lastTime = now;

    // A negative or absurd delta means the clock moved oddly. Skip the frame
    // rather than integrating nonsense.
    if (elapsed < 0 || elapsed > 5000) {
      this.accumulator = 0;
      return;
    }

    this.accumulator += elapsed;
    this.stepsThisFrame = 0;

    const dtSeconds = FIXED_TIMESTEP_MS / 1000;
    while (this.accumulator >= FIXED_TIMESTEP_MS && this.stepsThisFrame < MAX_STEPS_PER_FRAME) {
      this.callbacks.update(dtSeconds);
      this.accumulator -= FIXED_TIMESTEP_MS;
      this.stepsThisFrame += 1;
    }

    // Hit the cap: more time is owed than can be spent. Drop it rather than
    // spiralling, where each slow frame makes the next one slower still.
    if (this.stepsThisFrame >= MAX_STEPS_PER_FRAME) {
      this.accumulator = 0;
    }

    this.callbacks.render(this.accumulator / FIXED_TIMESTEP_MS);

    this.frameCount += 1;
    const windowMs = now - this.fpsWindowStart;
    if (windowMs >= 1000) {
      this.callbacks.onStats?.(
        Math.round((this.frameCount * 1000) / windowMs),
        this.stepsThisFrame,
      );
      this.frameCount = 0;
      this.fpsWindowStart = now;
    }
  };
}
