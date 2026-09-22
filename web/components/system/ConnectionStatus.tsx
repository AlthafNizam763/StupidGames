'use client';

import { useEffect, useState } from 'react';
import { RECONNECT_GRACE_MS } from '@voidline/shared';
import { Button } from '@/components/ui';
import { connectSocket } from '@/services/socket';
import { useRoomStore } from '@/stores/roomStore';
import { toast } from '@/stores/uiStore';
import { cn } from '@/lib/cn';

/**
 * Connection state, shown honestly (§AK, §AL).
 *
 * Two escalating surfaces over one piece of state, because a dropped
 * connection is not one event:
 *
 *   dropped, briefly   a small pill in the corner
 *   dropped, a while   a panel that says so and offers a retry
 *   recovered          a toast, through the notification system that exists
 *
 * WHY NOTHING IS SHOWN WHILE CONNECTED. §AK asks for a Connected state, and a
 * permanent green dot is the one thing it must not be: an indicator that is
 * always on is an indicator nobody reads, and this one needs to be noticed
 * exactly once in a session. It appears when something is wrong and leaves
 * when it is not.
 *
 * WHY THE PANEL DOES NOT KICK ANYBODY OUT. §AL is explicit, and the server
 * agrees: a dropped player keeps their seat, role, position and objective
 * progress for `RECONNECT_GRACE_MS`. Sending them home would throw away a seat
 * the server is still holding. So it waits, counts down the grace the server
 * is actually giving, and offers a retry.
 *
 * STRUCTURE: the trouble UI is a separate component mounted only while the
 * connection is troubled. That is what makes its elapsed-time counter correct
 * without tracking a timestamp - a new spell of trouble is a new mount, and
 * its state starts at zero because it is new.
 */

/** How long a drop is allowed to look like a blip before it gets a panel. */
const ESCALATE_AFTER_SECONDS = 6;

export function ConnectionStatus() {
  const connection = useRoomStore((s) => s.connection);
  const inRoom = useRoomStore((s) => s.room !== null);

  useRecoveryNotice();

  /*
   * Only meaningful inside a room. On the sign-in screen there is no socket
   * to lose, and `idle` is not a fault worth reporting.
   */
  const troubled = connection === 'reconnecting' || connection === 'error';
  if (!inRoom || !troubled) return null;

  return <Trouble offline={connection === 'error'} />;
}

/* -------------------------------------------------------------- trouble - */

function Trouble({ offline }: { offline: boolean }) {
  const seconds = useElapsedSeconds();
  const graceLeft = Math.max(0, Math.ceil(RECONNECT_GRACE_MS / 1000) - seconds);

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center p-2 pt-safe"
      >
        <span
          className={cn(
            'animate-rise flex items-center gap-2 rounded-full border px-3 py-1.5',
            'text-xs font-medium backdrop-blur',
            offline
              ? 'border-alert/40 bg-alert-glow text-alert'
              : 'border-caution/40 bg-caution/10 text-caution',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'animate-pulse-soft block size-2 rounded-full',
              offline ? 'bg-alert' : 'bg-caution',
            )}
          />
          {offline ? 'Offline' : 'Reconnecting…'}
        </span>
      </div>

      {seconds >= ESCALATE_AFTER_SECONDS ? <LostPanel graceLeft={graceLeft} /> : null}
    </>
  );
}

function LostPanel({ graceLeft }: { graceLeft: number }) {
  const [retrying, setRetrying] = useState(false);

  return (
    <div
      role="alertdialog"
      aria-label="Connection lost"
      className="fixed inset-0 z-[59] flex items-center justify-center bg-void-950/85 px-safe backdrop-blur-sm"
    >
      <div className="animate-pop w-full max-w-sm rounded-2xl border border-void-700 bg-void-900 p-6 text-center shadow-lift">
        <p className="font-mono text-xs tracking-[0.3em] text-alert uppercase">Connection lost</p>
        <h2 className="mt-3 font-display text-xl font-bold text-ink">Trying to reconnect</h2>

        <p className="mt-3 text-sm text-ink-muted">
          {graceLeft > 0 ? (
            <>
              Your seat, your role and everything you have done are held for{' '}
              <span className="font-mono text-ink tabular-nums">{graceLeft}s</span>. Get back before
              then and you carry on where you left off.
            </>
          ) : (
            <>The station has given your seat up. The room may still be running without you.</>
          )}
        </p>

        <Button
          fullWidth
          className="mt-5"
          loading={retrying}
          onClick={() => {
            setRetrying(true);
            connectSocket();
            // The socket reports back through the store. This only stops the
            // button being pressed repeatedly while that happens.
            setTimeout(() => setRetrying(false), 1_500);
          }}
        >
          Try now
        </Button>

        <p className="mt-3 text-xs text-ink-faint">
          It is already retrying by itself. This only asks it to hurry.
        </p>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- timing - */

/**
 * Seconds since this component mounted.
 *
 * No timestamp and no reset logic: the component is mounted when trouble
 * starts and unmounted when it ends, so "since mount" and "since the
 * connection dropped" are the same number by construction.
 */
function useElapsedSeconds(): number {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1_000);
    return () => clearInterval(timer);
  }, []);

  return seconds;
}

/**
 * Says so when the connection comes back.
 *
 * A subscription to the store rather than a comparison against a previous
 * render - which is what an effect is actually for, and it keeps the
 * transition detection out of the render path entirely. It also reuses the
 * toast system instead of inventing a second way to say one sentence.
 */
function useRecoveryNotice(): void {
  useEffect(() => {
    let wasTroubled = false;

    return useRoomStore.subscribe((state) => {
      const troubled = state.connection === 'reconnecting' || state.connection === 'error';

      if (troubled) {
        wasTroubled = true;
        return;
      }

      // Only announce a recovery into a room. Leaving one also ends the
      // trouble, and "Reconnected" on the home screen would be nonsense.
      if (wasTroubled && state.room !== null && state.connection === 'connected') {
        toast.success('Reconnected.', 'You are back in the room.');
      }

      wasTroubled = false;
    });
  }, []);
}
