'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether the player has asked the operating system for reduced motion.
 *
 * `globals.css` already neutralises CSS animation for these players, but a
 * timed *sequence* is not a CSS animation - a role reveal that runs for three
 * seconds before showing the answer is still three seconds of waiting, and
 * the shadow sweep and the silhouette swap are exactly the kind of motion the
 * setting exists to avoid. Components read this and cut to the final state.
 *
 * Built on `useSyncExternalStore` rather than `useEffect` + `useState`,
 * because that is what it is: a subscription to a value that lives outside
 * React. The effect version renders once with the wrong answer and then
 * corrects, which is a visible frame of motion for somebody who asked for
 * none.
 */

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

/** The server has no media queries, so it assumes motion is wanted. */
function getServerSnapshot(): boolean {
  return false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
