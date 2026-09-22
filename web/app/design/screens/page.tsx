'use client';

import dynamic from 'next/dynamic';
import { notFound } from 'next/navigation';

/**
 * Signed-in screen preview — entry point.
 *
 * Development only.
 *
 * Loaded with `ssr: false` deliberately. The preview rebases the sample
 * payloads' deadlines onto the real clock, so a server render and the client
 * render disagree about what second it is, and React reports a hydration
 * mismatch on every load. Rendering it only in the browser removes the
 * mismatch at its source rather than papering over it with `suppressHydration`.
 *
 * The game itself does not have this problem: the match screen has no
 * snapshot until the socket delivers one, so its clocks never render on the
 * server.
 */
const ScreenPreview = dynamic(() => import('./preview').then((m) => m.ScreenPreview), {
  ssr: false,
});

export default function ScreenPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <ScreenPreview />;
}
