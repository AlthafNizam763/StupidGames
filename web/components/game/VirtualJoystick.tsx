'use client';

import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

/**
 * The on-screen joystick (§7).
 *
 * Deliberately a DOM element, not part of the canvas. It has to sit above the
 * game, respond to touch, and be positioned by the player's control-position
 * setting - all of which the layout engine does better than hand-written hit
 * testing would. It writes into the engine's input manager directly, so moving
 * the stick never re-renders React.
 *
 * Behaviours that matter on a phone:
 *
 * - **Floating origin.** The stick appears where the thumb lands inside the
 *   zone rather than at a fixed point, so nobody has to find it by feel.
 * - **Dead zone.** Below a small radius the input reads as zero; a thumb resting
 *   on glass is never perfectly still.
 * - **Pointer capture.** The gesture keeps tracking if the thumb leaves the
 *   element, which it will.
 * - **`touch-action: none`.** Without it the browser claims the gesture as a
 *   scroll and the stick stops responding mid-drag (§39).
 */

const ZONE_RADIUS = 64;
const DEAD_ZONE = 0.12;

export interface VirtualJoystickProps {
  onChange: (value: { x: number; y: number; magnitude: number } | null) => void;
  /** Multiplies travel. From the player's settings. */
  sensitivity?: number;
  className?: string;
}

export function VirtualJoystick({ onChange, sensitivity = 1, className }: VirtualJoystickProps) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const pointerRef = useRef<number | null>(null);

  // Knob position is React state because it changes only while a thumb is
  // down - a handful of updates per gesture, not per frame.
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);

  const emit = useCallback(
    (dx: number, dy: number) => {
      const distance = Math.hypot(dx, dy);
      const clamped = Math.min(distance, ZONE_RADIUS);
      const magnitude = Math.min(1, (clamped / ZONE_RADIUS) * sensitivity);

      if (magnitude < DEAD_ZONE || distance === 0) {
        onChange({ x: 0, y: 0, magnitude: 0 });
        setKnob({ x: 0, y: 0 });
        return;
      }

      // Direction is normalised separately from magnitude, so pushing further
      // changes speed without changing heading.
      const nx = dx / distance;
      const ny = dy / distance;

      onChange({ x: nx, y: ny, magnitude });
      setKnob({ x: nx * clamped, y: ny * clamped });
    },
    [onChange, sensitivity],
  );

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // One finger drives the stick. A second touch landing in the zone must not
    // hijack a gesture already in progress.
    if (pointerRef.current !== null) return;

    const zone = zoneRef.current;
    if (!zone) return;

    const rect = zone.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    pointerRef.current = event.pointerId;
    originRef.current = { x: localX, y: localY };
    setOrigin({ x: localX, y: localY });
    setKnob({ x: 0, y: 0 });

    // Keeps delivering events even once the thumb slides off the element.
    zone.setPointerCapture(event.pointerId);
    onChange({ x: 0, y: 0, magnitude: 0 });
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (pointerRef.current !== event.pointerId) return;

    const zone = zoneRef.current;
    const start = originRef.current;
    if (!zone || !start) return;

    const rect = zone.getBoundingClientRect();
    emit(event.clientX - rect.left - start.x, event.clientY - rect.top - start.y);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (pointerRef.current !== event.pointerId) return;

    pointerRef.current = null;
    originRef.current = null;
    setOrigin(null);
    setKnob(null);
    // null, not a zero vector: the engine treats it as "no thumb down" and
    // lets the keyboard take over again.
    onChange(null);
  }

  return (
    <div
      ref={zoneRef}
      // Decorative to assistive tech: a screen reader user is not dragging a
      // virtual stick, and keyboard movement is fully supported (§46).
      aria-hidden
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={cn(
        'relative touch-none select-none',
        'h-44 w-44',
        className,
      )}
    >
      {/* Resting hint, shown until a thumb lands. */}
      {!origin ? (
        <div className="absolute inset-0 grid place-items-center">
          <div className="size-28 rounded-full border-2 border-dashed border-void-600/70" />
        </div>
      ) : null}

      {origin ? (
        <>
          <div
            className="absolute rounded-full border-2 border-void-500/80 bg-void-900/50"
            style={{
              width: ZONE_RADIUS * 2,
              height: ZONE_RADIUS * 2,
              left: origin.x - ZONE_RADIUS,
              top: origin.y - ZONE_RADIUS,
            }}
          />
          <div
            className="absolute size-14 rounded-full border-2 border-signal bg-signal/25"
            style={{
              left: origin.x + (knob?.x ?? 0) - 28,
              top: origin.y + (knob?.y ?? 0) - 28,
            }}
          />
        </>
      ) : null}
    </div>
  );
}
