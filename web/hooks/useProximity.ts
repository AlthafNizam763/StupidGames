'use client';

import { useEffect, useRef, useState } from 'react';
import { ELIMINATION_RANGE, INTERACT_RANGE, REPORT_RANGE } from '@voidline/shared';
import type { Engine } from '@/game/engine/Engine';
import type { ProximityResult } from '@/game/engine/proximity';

/**
 * What the local player is standing next to, polled from the engine.
 *
 * WHY POLLED, and not pushed. The engine owns the authoritative local
 * positions and updates them every frame; the HUD needs them about five times
 * a second. Having the engine push would mean a `setState` from inside the
 * simulation loop - sixty React renders a second for a value that changes
 * meaningfully a handful of times. So the loop stays ignorant of React, and
 * React asks.
 *
 * The rate is deliberately low. A player walks at 140 world units per second,
 * so 5Hz means an affordance can be at most ~28 units late - well inside the
 * ranges below, and far cheaper than reading it per frame.
 *
 * WHAT IT DOES NOT DO: decide anything. `nearest` reads public world state and
 * knows nothing about roles, cooldowns or whose objective that terminal is,
 * and the server re-checks range on every action regardless. An affordance
 * shown here can still be refused, and that refusal is the authority.
 */

/** The widest range any action uses, so one query serves all of them. */
const QUERY_RANGE = Math.max(ELIMINATION_RANGE, REPORT_RANGE, INTERACT_RANGE);

const POLL_INTERVAL_MS = 200;

const EMPTY: ProximityResult = {
  player: null,
  body: null,
  terminal: null,
  repairStation: null,
};

export function useProximity(engine: Engine | null, active: boolean): ProximityResult {
  const [result, setResult] = useState<ProximityResult>(EMPTY);

  // Held in a ref so the comparison below does not need `result` as a
  // dependency, which would restart the interval on every change.
  const latest = useRef<ProximityResult>(EMPTY);

  useEffect(() => {
    /*
     * Nothing to poll. The hook returns EMPTY by derivation below rather than
     * by writing it into state here - a `setState` in an effect body costs an
     * extra render pass, and this one would fire on every phase change.
     */
    if (!engine || !active) return;

    const poll = () => {
      const next = engine.nearest({
        players: true,
        bodies: true,
        terminals: true,
        within: QUERY_RANGE,
      });

      /*
       * Only re-render when the *identity* of something nearby changes, not
       * when its distance does. Distance changes every single poll while
       * anybody is moving, and the HUD does not display it - so comparing on
       * ids turns five renders a second into approximately none.
       */
      if (!sameTargets(latest.current, next)) {
        latest.current = next;
        setResult(next);
      }
    };

    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      // So a later reactivation compares against nothing rather than against
      // whatever was nearby before the council started.
      latest.current = EMPTY;
    };
  }, [engine, active]);

  // Derived, not stored: while inactive there is nothing nearby, whatever the
  // last poll happened to see.
  return engine && active ? result : EMPTY;
}

function sameTargets(a: ProximityResult, b: ProximityResult): boolean {
  return (
    a.player?.id === b.player?.id &&
    a.body?.id === b.body?.id &&
    a.terminal?.id === b.terminal?.id &&
    a.repairStation?.id === b.repairStation?.id
  );
}

/** The ranges the server enforces, re-exported so the HUD can explain them. */
export { ELIMINATION_RANGE, INTERACT_RANGE, REPORT_RANGE };
