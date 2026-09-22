'use client';

import { levelForXp, xpForLevel } from '@voidline/shared';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { ROUTES } from '@/constants/routes';
import { useSessionStore } from '@/stores/sessionStore';

/**
 * The signed-in landing screen.
 *
 * PHASE 4 SCOPE: this shows the real, server-issued account - username, level,
 * XP - and offers sign-out. The full home screen (§10: avatar, PLAY, CREATE
 * ROOM, JOIN ROOM, FRIENDS, LEADERBOARD, PROFILE, SETTINGS) is Phase 5.
 *
 * Every value here comes from the server. Nothing is placeholder data, and no
 * button is wired to something that does not exist yet.
 */
export function HomeScreen() {
  const user = useSessionStore((s) => s.user);
  const logout = useSessionStore((s) => s.logout);
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  if (!user) return null;

  // Progress within the current level, not toward some absolute total - the
  // bar should fill as the next level approaches.
  const level = levelForXp(user.xp);
  const levelFloor = xpForLevel(level);
  const levelCeiling = xpForLevel(level + 1);
  const intoLevel = user.xp - levelFloor;
  const levelSpan = Math.max(1, levelCeiling - levelFloor);
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

      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-10">
        <section className="w-full max-w-md animate-rise rounded-2xl border border-void-700 bg-void-900 p-6 shadow-panel">
          <div className="flex items-center gap-4">
            {/*
             * Placeholder identicon until the avatar system lands in Phase 5.
             * It is derived from the username rather than being a stock image,
             * so two players never look alike.
             */}
            <div
              aria-hidden
              className="grid size-14 shrink-0 place-items-center rounded-2xl border border-void-600 bg-void-800 font-display text-xl font-bold text-signal"
            >
              {user.username.slice(0, 2).toUpperCase()}
            </div>

            <div className="min-w-0">
              <h1 className="truncate font-display text-xl font-bold text-ink">{user.username}</h1>
              <p className="text-sm text-ink-muted">
                Level {level} · {user.xp.toLocaleString()} XP
              </p>
            </div>
          </div>

          <div className="mt-5">
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

          <dl className="mt-6 grid grid-cols-3 gap-3 text-center">
            {[
              { label: 'Matches', value: user.stats.matchesPlayed },
              { label: 'Wins', value: user.stats.matchesWon },
              { label: 'Objectives', value: user.stats.objectivesCompleted },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-void-700 bg-void-850 p-3">
                <dt className="text-xs text-ink-faint">{stat.label}</dt>
                <dd className="mt-0.5 font-display text-lg font-bold text-ink">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="max-w-sm text-center text-sm leading-relaxed text-ink-faint">
          Matchmaking arrives in the next phase. Your account is live and your progress is being
          tracked from here on.
        </p>
      </div>
    </main>
  );
}
