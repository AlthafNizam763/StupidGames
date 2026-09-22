'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Engine } from '@/game/engine/Engine';
import type { EngineStats } from '@/game/engine/types';
import { DEFAULT_MAP_ID, ZONE_LABELS, type ZoneId } from '@voidline/shared';
import { mapsApi } from '@/services/maps';
import { useSessionStore } from '@/stores/sessionStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { VirtualJoystick } from './VirtualJoystick';
import { cn } from '@/lib/cn';

/**
 * The React bridge to the engine.
 *
 * This component mounts a canvas, hands it to the engine, and then gets out of
 * the way. It holds a *ref* to the engine rather than state, because putting it
 * in state would make every engine change a re-render - and the engine changes
 * sixty times a second.
 *
 * The only state here is the stats readout, updated about once a second, and
 * the joystick's own knob position while a thumb is down. Neither is in the
 * frame path.
 */
export function GameCanvas({ showStats = false }: { showStats?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);

  const user = useSessionStore((s) => s.user);
  const gameplay = useSettingsStore((s) => s.gameplay);
  const controls = useSettingsStore((s) => s.controls);

  const [stats, setStats] = useState<EngineStats | null>(null);
  const [failed, setFailed] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [zone, setZone] = useState<ZoneId | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !user) return;

    const engine = new Engine({
      canvas,
      // Sampled once a second by the loop, so this setState is not in the
      // frame path.
      onStats: setStats,
    });

    if (!engine.start()) {
      setFailed(true);
      return;
    }

    engine.spawnLocalPlayer(user.id, user.username, user.avatar);
    engineRef.current = engine;

    /*
     * The map is fetched after the loop is already running. Blocking on the
     * request would mean a black screen on a slow connection; instead the
     * engine renders an empty hull and fills in when the data lands.
     */
    let cancelled = false;
    void mapsApi
      .get(DEFAULT_MAP_ID)
      .then((map) => {
        if (!cancelled) engine.loadMap(map);
      })
      .catch(() => {
        if (!cancelled) setMapError('Could not load the station layout.');
      });

    /*
     * The current room is polled rather than pushed. It changes at walking
     * pace, so twice a second is imperceptibly behind - and it keeps the
     * engine from calling setState, which is the rule this whole design rests
     * on.
     */
    const zoneTimer = setInterval(() => {
      if (!cancelled) setZone(engine.localZone());
    }, 500);

    return () => {
      cancelled = true;
      clearInterval(zoneTimer);
      engine.stop();
      engineRef.current = null;
    };
    // Deliberately keyed on identity only. Re-creating the engine because a
    // settings toggle changed would restart the match.
  }, [user?.id, user?.username, user?.avatar, user]);

  // Settings are pushed into the engine rather than recreating it.
  useEffect(() => {
    engineRef.current?.applySettings({
      showPlayerNames: gameplay.showPlayerNames,
      visualEffects: gameplay.visualEffects,
    });
  }, [gameplay.showPlayerNames, gameplay.visualEffects]);

  const handleJoystick = useCallback(
    (value: { x: number; y: number; magnitude: number } | null) => {
      // Straight into the engine. This never touches React state, so dragging
      // the stick costs nothing beyond the knob's own position.
      engineRef.current?.input.setJoystick(value);
    },
    [],
  );

  if (failed) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <p className="text-sm text-ink-muted">
          This browser could not open a 2D canvas, so the game cannot render.
        </p>
      </div>
    );
  }

  return (
    <div className="viewport-locked relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        // Focusable so keyboard players can tab to the game surface; the
        // engine listens on the window, but focus makes the target obvious.
        tabIndex={0}
        aria-label="Game view"
        className="block h-full w-full outline-none"
      />

      {/*
       * The joystick sits on the side the player chose. Left-handed players
       * are not an afterthought, and a stick fixed to the left is unusable for
       * a third of people holding a phone one-handed.
       */}
      <div
        className={cn(
          'pointer-events-none absolute bottom-0 z-10 p-4 pb-safe',
          controls.joystickPosition === 'left' ? 'left-0' : 'right-0',
        )}
      >
        <VirtualJoystick
          onChange={handleJoystick}
          sensitivity={controls.joystickSensitivity}
          className="pointer-events-auto"
        />
      </div>

      {zone ? (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-3 pt-safe">
          <span className="rounded-full border border-void-600 bg-void-900/90 px-3 py-1 text-xs font-medium tracking-[0.2em] text-ink-muted uppercase">
            {ZONE_LABELS[zone]}
          </span>
        </div>
      ) : null}

      {mapError ? (
        <div className="pointer-events-none absolute inset-x-0 top-14 z-10 flex justify-center p-3">
          <span role="alert" className="rounded-xl border border-alert/40 bg-alert-glow px-3 py-2 text-sm text-ink">
            {mapError}
          </span>
        </div>
      ) : null}

      {showStats && stats ? (
        <div className="pointer-events-none absolute left-2 top-2 z-10 rounded-lg bg-void-950/80 px-2 py-1 font-mono text-xs text-ink-muted tabular-nums">
          {stats.fps} fps · {stats.steps} step{stats.steps === 1 ? '' : 's'} ·{' '}
          {stats.entities} entities
        </div>
      ) : null}
    </div>
  );
}
