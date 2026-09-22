'use client';

import { useEffect, useRef } from 'react';
import { useSessionStore } from '@/stores/sessionStore';

/**
 * Restores the session once, on first load.
 *
 * Mounted in the root layout so every route benefits, and rendered as a
 * sibling of the page rather than a wrapper - it draws nothing, so there is no
 * reason for the whole tree to sit inside a Client Component.
 *
 * Until this resolves, `status` is `unknown` and no screen may act on whether
 * the visitor is signed in. Guessing "anonymous" for that first moment is what
 * produces the flash of a sign-in screen before a signed-in home page.
 */
export function SessionBoot() {
  const restore = useSessionStore((s) => s.restore);
  const started = useRef(false);

  useEffect(() => {
    // React 19 Strict Mode mounts effects twice in development. Without this
    // guard the app fires two refresh calls on every load.
    if (started.current) return;
    started.current = true;
    void restore();
  }, [restore]);

  return null;
}
