'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, StatusDot } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ROUTES } from '@/constants/routes';
import { checkUplink, type UplinkStatus } from '@/services/system';

/**
 * The entry control on the splash screen.
 *
 * It reports the real state of the game server rather than assuming one. There
 * is no point sending a player into a sign-in flow that cannot complete, so
 * PLAY unlocks only once the server actually answers - and when it does not,
 * the screen says so plainly and offers a retry (§45).
 */
export function UplinkGate() {
  const [status, setStatus] = useState<UplinkStatus>('checking');
  /* Bumping this re-runs the probe. The effect subscribes to an external
     system and writes the result back in a callback; it never sets state
     synchronously in its own body, which would cascade renders. */
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    void checkUplink().then((online) => {
      if (!cancelled) setStatus(online ? 'online' : 'offline');
    });

    // Stops a late response from a previous attempt overwriting a newer one.
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  function retry() {
    setStatus('checking');
    setAttempt((n) => n + 1);
  }

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <div aria-live="polite" className="min-h-6">
        {status === 'checking' ? (
          <Badge tone="neutral" icon={<StatusDot tone="neutral" pulse />}>
            Establishing uplink
          </Badge>
        ) : status === 'online' ? (
          <Badge tone="signal" icon={<StatusDot tone="signal" pulse />}>
            Station uplink nominal
          </Badge>
        ) : (
          <Badge tone="alert" icon={<StatusDot tone="alert" />}>
            Station uplink unavailable
          </Badge>
        )}
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3">
        {status === 'online' ? (
          <ButtonLink href={ROUTES.login} size="lg" fullWidth>
            PLAY
          </ButtonLink>
        ) : (
          <Button size="lg" fullWidth loading={status === 'checking'} disabled>
            PLAY
          </Button>
        )}

        {status === 'offline' ? (
          <>
            <Button variant="secondary" size="md" fullWidth onClick={retry}>
              Retry connection
            </Button>
            <p className="text-center text-sm text-ink-faint">
              The game server is not responding. If you are running VOIDLINE locally, start it
              with <code className="font-mono text-ink-muted">npm run dev:server</code>.
            </p>
          </>
        ) : null}
      </div>

      {status === 'online' ? (
        <Link
          href={ROUTES.register}
          className="touch-target inline-flex items-center px-3 text-sm text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline"
        >
          New crew? Create an account
        </Link>
      ) : null}
    </div>
  );
}
