'use client';


import { useState } from 'react';
import { notFound } from 'next/navigation';
import { useSearchParams } from 'next/navigation';
import {
  DEFAULT_AVATAR_ID,
  deriveAppearance,
  type CharacterAppearance,
  type SelfUser,
} from '@voidline/shared';
import { CharacterCustomiser } from '@/components/character';
import { HomeScreen } from '@/components/home/HomeScreen';
import { useSessionStore } from '@/stores/sessionStore';

/**
 * Signed-in screen preview.
 *
 * Development only, and `notFound()` in production.
 *
 * WHY THIS EXISTS, and why it is not a licence to fake game state. The
 * signed-in screens cannot be reached without an API server and a database,
 * and neither is running in this environment. Without something like this,
 * every screen behind authentication ships unlooked-at - which is how the
 * project got ten phases deep with nobody having opened it in a browser.
 *
 * WHAT IT IS ALLOWED TO DO: seed the session store with one obviously
 * fictional account so a *layout* can be reviewed.
 *
 * WHAT IT IS NOT: a substitute for the real thing. It proves a screen lays
 * out correctly at 320px; it proves nothing about whether the data binding is
 * right. No component gains a "preview mode", no component takes sample data
 * as a prop, and nothing in `components/` knows this page exists. The moment
 * a server is available, these screens should be reviewed signed in for real.
 */

/** One fictional account. The id is not a real id and the email is not real. */
function sampleUser(): SelfUser {
  const id = 'preview-operator';
  return {
    id,
    username: 'Maya',
    email: 'preview@example.invalid',
    avatar: 'operator-03',
    // Kept consistent with `xp`: every screen derives the level with
    // `levelForXp`, so a `level` here that disagrees would make the preview
    // look like a rounding bug that does not exist.
    level: 5,
    xp: 2_640,
    appearance: deriveAppearance(id),
    stats: {
      matchesPlayed: 84,
      matchesWon: 47,
      matchesLost: 37,
      operatorWins: 31,
      saboteurWins: 16,
      eliminations: 29,
      objectivesCompleted: 402,
      winRate: 0.56,
    },
    achievements: [
      { id: 'FIRST_MATCH', unlockedAt: '2026-04-02T10:00:00.000Z' },
      { id: 'FIRST_VICTORY', unlockedAt: '2026-04-02T10:40:00.000Z' },
      { id: 'SURVIVOR', unlockedAt: '2026-06-18T21:12:00.000Z' },
    ],
    createdAt: '2026-04-02T09:30:00.000Z',
    updatedAt: '2026-09-20T18:05:00.000Z',
  };
}

/**
 * The customiser, holding its own state.
 *
 * In the real profile screen this state is the stored appearance and `onSave`
 * calls the API. Here it is local, so the interaction can be reviewed without
 * a server - the component itself is identical either way, because it takes
 * everything as props.
 */
function CustomiseScreen() {
  const user = useSessionStore((s) => s.user);
  const [appearance, setAppearance] = useState<CharacterAppearance | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);

  if (!user) return null;

  const value = appearance ?? user.appearance;
  const avatarId = avatar ?? user.avatar;

  return (
    <main className="station-backdrop min-h-screen-safe px-safe py-6">
      <div className="mx-auto w-full max-w-4xl">
        <h1 className="mb-1 font-display text-2xl font-bold text-ink">Your character</h1>
        <p className="mb-5 text-sm text-ink-muted">
          This is what every other player sees — in the lobby, on the map, and in the council.
        </p>
        <CharacterCustomiser
          value={value}
          avatarId={avatarId}
          onChange={setAppearance}
          onAvatarChange={setAvatar}
          onSave={() => undefined}
          dirty={appearance !== null || avatar !== null}
        />
      </div>
    </main>
  );
}

const SCREENS = {
  home: HomeScreen,
  customise: CustomiseScreen,
} as const;

export default function ScreenPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <Preview />;
}

/*
 * Seeded at module scope, before anything renders.
 *
 * A zustand store is external to React, so writing to it here is the same
 * kind of call the socket layer makes - not a render side effect. Doing it in
 * an effect instead would render the signed-out screen first and then swap,
 * which is a flash of the wrong page in every screenshot.
 */
function seed(): void {
  useSessionStore.setState({
    status: 'authenticated',
    user: sampleUser(),
    // No token. Nothing here may reach the network, and anything that tries
    // will fail loudly rather than quietly using a fabricated credential.
    accessToken: null,
  });
}

seed();

/*
 * And re-seed if anything signs the preview out.
 *
 * `SessionBoot` in the root layout calls `restore()` on mount, which asks the
 * API to rebuild the session from the refresh cookie. With no API running
 * that request fails, and its catch sets the store to anonymous - wiping the
 * sample account a moment after this module set it, so every preview renders
 * blank. Re-seeding on any transition away from authenticated makes the
 * harness survive that without touching the session store's own code.
 */
useSessionStore.subscribe((state) => {
  if (state.status !== 'authenticated' || state.user === null) seed();
});

function Preview() {
  const params = useSearchParams();
  const name = (params.get('screen') ?? 'home') as keyof typeof SCREENS;

  const Screen = SCREENS[name] ?? SCREENS.home;

  return (
    <>
      <p className="fixed top-0 right-0 z-[100] rounded-bl-lg bg-caution px-2 py-1 font-mono text-[0.625rem] font-bold text-void-950">
        PREVIEW — sample account
      </p>
      <Screen />
    </>
  );
}

/** Also exported for the avatar roster, so a preview can be built per avatar. */
export { DEFAULT_AVATAR_ID };
