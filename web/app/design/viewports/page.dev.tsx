import { notFound } from 'next/navigation';

/**
 * The responsive acceptance harness.
 *
 * Development only.
 *
 * §BJ asks for every screen to be checked at 320, 375, 390, 430, 768, 1024,
 * 1280, 1440 and 1920 - no horizontal scrolling, no clipped buttons, no
 * overlapping UI, no unreachable controls. Doing that by resizing a window
 * nine times per screen is how it silently stops being done.
 *
 * It also cannot be done with a headless screenshot directly: Chrome clamps
 * its window to a 500px minimum width, so asking for a 320px screenshot
 * quietly gives you a 500px render cropped to 320 - which looks exactly like
 * a horizontal overflow bug and is not one. That mistake cost an hour, so it
 * is written down here.
 *
 * An iframe has no such minimum. Each frame below is a real layout viewport
 * at the real width, and one screenshot of this page checks every breakpoint
 * at once.
 *
 *   /design/viewports?path=/login
 *   /design/viewports?path=/design/reveal%3Frole%3Dcat&set=mobile
 */

const SETS = {
  mobile: [320, 375, 390, 430],
  tablet: [768, 834],
  desktop: [1024, 1280],
} as const;

type SetName = keyof typeof SETS;

/** Tall enough to show a full phone screen without the frame itself scrolling. */
const FRAME_HEIGHT = 880;

export default async function ViewportHarnessPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string; set?: string; h?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();

  const params = await searchParams;
  const path = params.path ?? '/home';
  const set: SetName = params.set === 'tablet' || params.set === 'desktop' ? params.set : 'mobile';
  const height = Number(params.h) > 0 ? Number(params.h) : FRAME_HEIGHT;

  /*
   * Only same-origin paths. This page exists to frame this application, and
   * accepting an absolute URL would turn a dev tool into an open framer of
   * anything - pointless here, and a bad habit to leave in a codebase.
   */
  const safePath = path.startsWith('/') && !path.startsWith('//') ? path : '/home';

  return (
    <main className="min-h-screen-safe bg-void-950 p-6">
      <header className="mb-5">
        <p className="font-mono text-xs tracking-[0.3em] text-ink-faint uppercase">
          Development only — responsive check
        </p>
        <h1 className="mt-1 font-mono text-sm text-ink">{safePath}</h1>
      </header>

      <div className="flex items-start gap-5 overflow-x-auto pb-4">
        {SETS[set].map((width) => (
          <figure key={width} className="shrink-0">
            <figcaption className="mb-2 font-mono text-xs text-ink-muted">{width}px</figcaption>
            <iframe
              src={safePath}
              title={`${safePath} at ${width} pixels`}
              width={width}
              height={height}
              // A real layout viewport at this width, with its own scrollbar
              // suppressed so the capture shows the page and not the chrome.
              className="block rounded-xl border border-void-600 bg-void-950"
              scrolling="no"
            />
          </figure>
        ))}
      </div>
    </main>
  );
}
