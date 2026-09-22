'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ROUTES } from '@/constants/routes';
import { GameCanvas } from './GameCanvas';

/**
 * The match screen.
 *
 * PHASE 9 SCOPE, stated plainly on screen rather than only here: this runs the
 * real engine - fixed-timestep simulation, collision, camera, keyboard and
 * joystick input - against a placeholder arena, with only the local player.
 *
 * What is missing is not the engine: it is the map (Phase 10), networked
 * movement (Phase 11) and roles (Phase 12). The HUD in §38 arrives with the
 * gameplay it reports on. Nothing here fakes a match.
 */
export function GameScreen({ code }: { code: string }) {
  const [showStats, setShowStats] = useState(true);

  return (
    <main id="main" className="h-screen-safe relative w-full overflow-hidden">
      <GameCanvas showStats={showStats} />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-3 pt-safe">
        <Link
          href={ROUTES.lobby(code)}
          className="pointer-events-auto touch-target inline-flex items-center rounded-xl border border-void-600 bg-void-900/90 px-3 text-sm font-medium text-ink"
        >
          Back to lobby
        </Link>

        <button
          type="button"
          onClick={() => setShowStats((value) => !value)}
          className="pointer-events-auto touch-target inline-flex items-center rounded-xl border border-void-600 bg-void-900/90 px-3 text-sm text-ink-muted"
        >
          {showStats ? 'Hide' : 'Show'} stats
        </button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-3 pb-safe">
        <p className="max-w-md rounded-xl border border-void-700 bg-void-900/90 px-3 py-2 text-center text-xs leading-relaxed text-ink-faint">
          Engine preview. Move with WASD, the arrow keys, or the joystick. The ORBITAL-09 map,
          other players and roles arrive in the phases after this one.
        </p>
      </div>
    </main>
  );
}
