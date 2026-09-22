import { Logo } from '@/components/brand/Logo';
import { UplinkGate } from '@/components/splash/UplinkGate';

/**
 * Splash / entry screen.
 *
 * This is a Server Component: the copy and layout are static, so they ship as
 * HTML with no JavaScript attached. Only `UplinkGate` - which has to probe the
 * server and hold state - is a Client Component. Marking this whole page
 * `"use client"` would send the entire tree to the browser for the sake of one
 * interactive island (§1).
 */

const FACTIONS = [
  {
    name: 'Operators',
    tone: 'text-signal',
    line: 'Keep ORBITAL-09 running. Complete station objectives, watch the crew, and work out who is lying before there are too few of you left to matter.',
  },
  {
    name: 'Saboteurs',
    tone: 'text-alert',
    line: 'You look exactly like an Operator. Eliminate the crew quietly, drive the facility toward critical failure, and make sure someone else takes the blame.',
  },
] as const;

export default function SplashPage() {
  return (
    <main
      id="main"
      className="min-h-screen-safe flex flex-col items-center justify-between gap-10 px-safe pb-safe pt-safe"
    >
      {/* Spacer keeps the mark optically centred on tall screens without
          pinning it with a fixed height that would break on a short one. */}
      <div aria-hidden className="h-2 sm:h-8" />

      <section className="flex w-full max-w-md flex-col items-center gap-8 animate-rise">
        <Logo stacked showTagline />

        <p className="text-center text-balance text-sm leading-relaxed text-ink-muted sm:text-base">
          The station is losing systems and the crew cannot agree on why. Some of you are trying
          to save it. Some of you are the reason it is failing.
        </p>

        <UplinkGate />
      </section>

      <section className="w-full max-w-md pb-6">
        <div aria-hidden className="rule-fade mb-6" />
        <h2 className="sr-only">The two factions</h2>
        <ul className="flex flex-col gap-4">
          {FACTIONS.map((faction) => (
            <li key={faction.name}>
              <h3
                className={`font-display text-xs font-bold tracking-[0.25em] uppercase ${faction.tone}`}
              >
                {faction.name}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-faint">{faction.line}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
