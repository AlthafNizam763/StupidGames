'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether this browser has seen something before.
 *
 * Used for the one-time "how to play" run-through. Deliberately per-browser
 * rather than per-account: it answers "does the person at this screen know
 * what this game is", which is not a fact about an account and is not worth a
 * column on one.
 *
 * Every read and write is wrapped, because `localStorage` throws rather than
 * returning null in a private window and in any context where site data is
 * blocked. A player with cookies disabled should get the introduction every
 * time, which is mildly repetitive; they should not get a crashed home screen.
 *
 * Built on `useSyncExternalStore` so a component that marks something seen
 * re-renders without an effect, and so the server render has a defined answer:
 * `true`, meaning "seen", so nothing flashes up during hydration and is then
 * taken away.
 */

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === 'seen';
  } catch {
    // Private window, or site data blocked. Treat as unseen.
    return false;
  }
}

export function useFirstVisit(key: string): { seen: boolean; markSeen: () => void } {
  const seen = useSyncExternalStore(
    subscribe,
    () => read(key),
    // The server cannot know, and guessing "unseen" would render the
    // introduction into the HTML and then remove it on hydration.
    () => true,
  );

  const markSeen = useCallback(() => {
    try {
      window.localStorage.setItem(key, 'seen');
    } catch {
      // Nothing to do. The introduction simply appears again next time.
    }
    emit();
  }, [key]);

  return { seen, markSeen };
}
