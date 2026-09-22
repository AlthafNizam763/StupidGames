'use client';

import { useEffect } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ROUTES } from '@/constants/routes';

/**
 * Route-level error boundary.
 *
 * Error boundaries must be Client Components - they hold the reset handler and
 * catch errors thrown while rendering on the client.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Phase 28 forwards this to real error tracking. Logging it here at least
    // means the detail is not lost while that does not exist yet.
    console.error('[voidline] route error', error);
  }, [error]);

  return (
    <main
      id="main"
      className="min-h-screen-safe flex flex-col items-center justify-center gap-6 px-safe text-center"
    >
      <span
        aria-hidden
        className="grid size-14 place-items-center rounded-full border border-alert/30 bg-alert-glow text-2xl font-bold text-alert"
      >
        !
      </span>

      <div className="max-w-md">
        <h1 className="font-display text-2xl font-bold text-ink">Systems fault</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Something failed while loading this screen. Your account and any match in progress are
          unaffected.
        </p>
        {/*
         * The digest is the only detail shown. A stack trace here would leak
         * internals to every player (SECURITY.md); the digest is what support
         * needs to find the real error in the server logs.
         */}
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-ink-faint">Reference: {error.digest}</p>
        ) : null}
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2">
        <Button size="md" fullWidth onClick={reset}>
          Try again
        </Button>
        <ButtonLink href={ROUTES.splash} variant="secondary" size="md" fullWidth>
          Back to start
        </ButtonLink>
      </div>
    </main>
  );
}
