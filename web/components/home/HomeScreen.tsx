'use client';

import { levelForXp, xpForLevel } from '@voidline/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Avatar } from '@/components/brand/Avatar';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/lib/cn';
import { useSessionStore } from '@/stores/sessionStore';

/**
 * The signed-in home screen (§10).
 *
 * Layout intent: the player card and PLAY sit in the thumb's reach on a phone,
 * with the secondary grid below. On a wide screen the same content centres in a
 * single column rather than spreading into a dashboard - there are eight
 * destinations, and spreading eight things across 1400px makes them harder to
 * hit, not easier (§38).
 *
 * Destinations whose phase has not landed are rendered as disabled tiles marked
 * "Soon", not as links. A tile that navigates to a 404 is worse than one that
 * says it is not ready.
 */

interface Destination {
  key: string;
  label: string;
  description: string;
  href: string | null;
  icon: ReactNode;
}

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-5">
      <path
        d={path}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const DESTINATIONS: Destination[] = [
  {
    key: 'create',
    label: 'Create room',
    description: 'Host a match',
    href: ROUTES.createRoom,
    icon: <Icon path="M12 5v14M5 12h14" />,
  },
  {
    key: 'join',
    label: 'Join room',
    description: 'Enter a code',
    href: ROUTES.joinRoom,
    icon: <Icon path="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" />,
  },
  {
    key: 'friends',
    label: 'Friends',
    description: 'Your crew',
    href: null,
    icon: <Icon path="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87" />,
  },
  {
    key: 'leaderboard',
    label: 'Leaderboard',
    description: 'Station rankings',
    href: null,
    icon: <Icon path="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />,
  },
  {
    key: 'profile',
    label: 'Profile',
    description: 'Record and achievements',
    href: ROUTES.profile,
    icon: <Icon path="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />,
  },
  {
    key: 'settings',
    label: 'Settings',
    description: 'Audio, controls, language',
    href: ROUTES.settings,
    icon: <Icon path="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />,
  },
];

function DestinationTile({ destination }: { destination: Destination }) {
  const inner = (
    <>
      <span
        className={cn(
          'grid size-10 shrink-0 place-items-center rounded-xl border',
          destination.href
            ? 'border-void-600 bg-void-800 text-signal'
            : 'border-void-700 bg-void-850 text-ink-faint',
        )}
      >
        {destination.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9375rem] font-medium text-ink">
          {destination.label}
        </span>
        <span className="block truncate text-sm text-ink-faint">{destination.description}</span>
      </span>
      {!destination.href ? (
        <span className="shrink-0 rounded-full border border-void-600 px-2 py-0.5 text-[0.6875rem] font-medium tracking-wide text-ink-faint uppercase">
          Soon
        </span>
      ) : null}
    </>
  );

  const shared =
    'flex min-h-16 w-full items-center gap-3 rounded-2xl border p-3 text-left transition-colors';

  if (!destination.href) {
    return (
      <div
        aria-disabled
        className={cn(shared, 'cursor-not-allowed border-void-700/70 bg-void-900/50 opacity-70')}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={destination.href}
      className={cn(shared, 'border-void-700 bg-void-900 hover:border-void-500 hover:bg-void-850')}
    >
      {inner}
    </Link>
  );
}

export function HomeScreen() {
  const user = useSessionStore((s) => s.user);
  const logout = useSessionStore((s) => s.logout);
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  if (!user) return null;

  // Progress within the current level, not toward an absolute total - the bar
  // should fill as the next level approaches.
  const level = levelForXp(user.xp);
  const levelFloor = xpForLevel(level);
  const levelSpan = Math.max(1, xpForLevel(level + 1) - levelFloor);
  const intoLevel = user.xp - levelFloor;
  const progress = Math.min(100, Math.round((intoLevel / levelSpan) * 100));

  async function handleSignOut() {
    setSigningOut(true);
    await logout();
    router.replace(ROUTES.splash);
  }

  return (
    <main id="main" className="min-h-screen-safe flex flex-col px-safe pb-safe pt-safe">
      <header className="flex items-center justify-between gap-3 py-2">
        <Logo />
        <Button variant="ghost" size="sm" onClick={() => void handleSignOut()} loading={signingOut}>
          Sign out
        </Button>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 py-6">
        <section className="animate-rise rounded-2xl border border-void-700 bg-void-900 p-5 shadow-panel">
          <Link
            href={ROUTES.profile}
            className="flex items-center gap-4 rounded-xl transition-opacity hover:opacity-90"
          >
            <Avatar avatarId={user.avatar} name={`${user.username}'s avatar`} className="size-14" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-xl font-bold text-ink">{user.username}</h1>
              <p className="text-sm text-ink-muted">
                Level {level} · {user.xp.toLocaleString()} XP
              </p>
            </div>
          </Link>

          <div className="mt-4">
            <div className="mb-1.5 flex justify-between text-xs text-ink-faint">
              <span>Level {level}</span>
              <span>
                {intoLevel.toLocaleString()} / {levelSpan.toLocaleString()} XP
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progress to level ${level + 1}`}
              className="h-2 overflow-hidden rounded-full bg-void-800"
            >
              <div className="h-full rounded-full bg-signal" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </section>

        {/*
         * PLAY is the primary call to action (§10) and stays visually dominant
         * even while matchmaking is unbuilt - but it is disabled rather than
         * pointed at a route that does not exist.
         */}
        <section>
          {/*
           * PLAY means quick match - dropped into a room with strangers - which
           * needs matchmaking, not just rooms. Creating and joining by code
           * both work now, so the copy points at those rather than leaving the
           * player with nothing to do.
           */}
          <Button size="lg" fullWidth disabled className="h-16 text-lg tracking-[0.15em]">
            PLAY
          </Button>
          <p className="mt-2 text-center text-sm text-ink-faint">
            Quick match needs matchmaking, which is still to come. Create a room or join one with
            a code below.
          </p>
        </section>

        <nav aria-label="Main" className="grid gap-2.5 sm:grid-cols-2">
          {DESTINATIONS.map((destination) => (
            <DestinationTile key={destination.key} destination={destination} />
          ))}
        </nav>
      </div>
    </main>
  );
}
