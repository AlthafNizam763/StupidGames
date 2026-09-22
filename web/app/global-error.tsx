'use client';

import './globals.css';

/**
 * Last-resort boundary for errors thrown by the root layout itself.
 *
 * Because it replaces the layout, it has to render its own `<html>` and
 * `<body>`, and it cannot rely on anything the layout sets up - fonts, the
 * toaster, providers. It is styled with plain utilities for that reason: if
 * this screen is showing, the usual foundation is exactly what failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="bg-void-950 text-ink">
        <main className="min-h-screen-safe flex flex-col items-center justify-center gap-6 px-4 text-center">
          <h1 className="text-2xl font-bold">Station offline</h1>
          <p className="max-w-md text-sm text-ink-muted">
            VOIDLINE failed to start. Reloading usually clears it.
          </p>
          {error.digest ? (
            <p className="font-mono text-xs text-ink-faint">Reference: {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            className="h-12 min-w-44 rounded-xl bg-signal px-6 font-semibold text-void-950"
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
