'use client';

import { useEffect, useState } from 'react';

/**
 * Whether the player has asked the operating system for reduced motion.
 *
 * `globals.css` already neutralises CSS animation for these players, but a
 * timed *sequence* is not a CSS animation - a role reveal that runs for three
 * seconds before showing the answer is still three seconds of waiting, and
 * the shadow sweep and silhouette swap are exactly the kind of motion the
 * setting exists to avoid. Components read this and cut to the final state.
 *
 * Starts `false` and corrects after mount, because the server has no media
 * queries. That means one frame of the animated variant for a player who
 * asked for less, which is the lesser of the two available wrongs: the other
 * is a hydration mismatch on every page.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);

    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
