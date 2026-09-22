import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { FIXED_TIMESTEP_MS, GameLoop } from './GameLoop';

/**
 * The loop under a controlled clock.
 *
 * `requestAnimationFrame` and `performance.now` are stubbed so a frame can be
 * delivered at an exact moment. These behaviours - a fixed step regardless of
 * frame rate, and a cap on catch-up - are the ones that decide whether the game
 * stays consistent on a slow device, and they cannot be observed by eye.
 */

let now = 0;
let pending: ((time: number) => void) | null = null;
let nextHandle = 1;

const originalRaf = globalThis.requestAnimationFrame;
const originalCancel = globalThis.cancelAnimationFrame;
const originalPerformance = globalThis.performance;

beforeEach(() => {
  now = 0;
  pending = null;
  nextHandle = 1;

  globalThis.requestAnimationFrame = ((callback: (time: number) => void) => {
    pending = callback;
    return nextHandle++;
  }) as typeof globalThis.requestAnimationFrame;

  globalThis.cancelAnimationFrame = (() => {
    pending = null;
  }) as typeof globalThis.cancelAnimationFrame;

  globalThis.performance = { now: () => now } as Performance;
});

afterEach(() => {
  globalThis.requestAnimationFrame = originalRaf;
  globalThis.cancelAnimationFrame = originalCancel;
  globalThis.performance = originalPerformance;
});

/** Advances the clock and delivers one frame. */
function frame(advanceMs: number): void {
  now += advanceMs;
  const callback = pending;
  pending = null;
  callback?.(now);
}

describe('GameLoop', () => {
  it('runs one simulation step per frame at the target rate', () => {
    let steps = 0;
    const loop = new GameLoop({ update: () => steps++, render: () => {} });

    loop.start();
    frame(FIXED_TIMESTEP_MS);
    assert.equal(steps, 1);

    frame(FIXED_TIMESTEP_MS);
    assert.equal(steps, 2);

    loop.stop();
  });

  it('always steps by exactly the fixed timestep', () => {
    const deltas: number[] = [];
    const loop = new GameLoop({ update: (dt) => deltas.push(dt), render: () => {} });

    loop.start();
    // Deliberately irregular frames, as a real display produces.
    frame(16);
    frame(24);
    frame(9);
    frame(40);
    loop.stop();

    // Every step is identical. This is what makes collision and movement
    // behave the same on a 30fps phone and a 144Hz monitor.
    const expected = FIXED_TIMESTEP_MS / 1000;
    for (const dt of deltas) assert.equal(dt, expected);
  });

  it('catches up with several steps after a slow frame', () => {
    let steps = 0;
    const loop = new GameLoop({ update: () => steps++, render: () => {} });

    loop.start();
    /*
     * 55ms is worth 3.3 steps. Deliberately not an exact multiple of the
     * timestep: 1000/60 does not divide evenly in binary, so `TIMESTEP * 3`
     * lands a fraction either side of three steps depending on rounding, and a
     * test that asserts on that is testing floating point rather than the loop.
     */
    frame(55);
    loop.stop();

    assert.equal(steps, 3);
  });

  it('caps catch-up instead of spiralling', () => {
    let steps = 0;
    const loop = new GameLoop({ update: () => steps++, render: () => {} });

    loop.start();
    // Two seconds owed - roughly 120 steps. Running them all would freeze the
    // page far longer than the stall itself did.
    frame(2000);
    loop.stop();

    assert.ok(steps <= 5, `ran ${steps} steps in one frame`);
  });

  it('does not accumulate debt after hitting the cap', () => {
    let steps = 0;
    const loop = new GameLoop({ update: () => steps++, render: () => {} });

    loop.start();
    frame(2000);
    const afterStall = steps;

    // The next normal frame should be normal, not another catch-up burst.
    frame(FIXED_TIMESTEP_MS);
    loop.stop();

    assert.equal(steps - afterStall, 1);
  });

  it('skips a frame with an absurd delta rather than integrating it', () => {
    let steps = 0;
    const loop = new GameLoop({ update: () => steps++, render: () => {} });

    loop.start();
    // A clock jump, or a tab asleep for an hour.
    frame(60_000);
    loop.stop();

    assert.equal(steps, 0);
  });

  it('renders once per frame even when no step ran', () => {
    let renders = 0;
    let steps = 0;
    const loop = new GameLoop({ update: () => steps++, render: () => renders++ });

    loop.start();
    // Shorter than one step: nothing to simulate, but the frame still draws
    // at the interpolated position.
    frame(4);
    frame(4);
    loop.stop();

    assert.equal(steps, 0);
    assert.equal(renders, 2);
  });

  it('passes an interpolation alpha between 0 and 1', () => {
    const alphas: number[] = [];
    const loop = new GameLoop({ update: () => {}, render: (alpha) => alphas.push(alpha) });

    loop.start();
    frame(8);
    frame(8);
    frame(20);
    loop.stop();

    for (const alpha of alphas) {
      assert.ok(alpha >= 0 && alpha < 1, `alpha out of range: ${alpha}`);
    }
  });

  it('stops delivering frames once stopped', () => {
    let steps = 0;
    const loop = new GameLoop({ update: () => steps++, render: () => {} });

    loop.start();
    frame(FIXED_TIMESTEP_MS);
    loop.stop();

    const before = steps;
    frame(FIXED_TIMESTEP_MS);
    assert.equal(steps, before, 'a stopped loop must not keep simulating');
  });

  it('is safe to start twice', () => {
    let steps = 0;
    const loop = new GameLoop({ update: () => steps++, render: () => {} });

    loop.start();
    loop.start();
    frame(FIXED_TIMESTEP_MS);
    loop.stop();

    // Two loops running would double every step and make the game run at
    // twice speed.
    assert.equal(steps, 1);
  });

  it('discards owed time when the clock is reset', () => {
    let steps = 0;
    const loop = new GameLoop({ update: () => steps++, render: () => {} });

    loop.start();
    // Simulates a backgrounded tab: time passed but no frames were delivered.
    now += 5000;
    loop.resetClock();
    frame(FIXED_TIMESTEP_MS);
    loop.stop();

    assert.equal(steps, 1);
  });

  it('reports statistics about once a second', () => {
    const samples: Array<{ fps: number; steps: number }> = [];
    const loop = new GameLoop({
      update: () => {},
      render: () => {},
      onStats: (fps, steps) => samples.push({ fps, steps }),
    });

    loop.start();
    for (let i = 0; i < 61; i++) frame(FIXED_TIMESTEP_MS);
    loop.stop();

    assert.equal(samples.length, 1, 'stats should be sampled, not emitted per frame');
    assert.ok(samples[0]!.fps > 50 && samples[0]!.fps < 70, `fps was ${samples[0]!.fps}`);
  });
});
