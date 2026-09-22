'use client';

import {
  ACHIEVEMENTS,
  ACHIEVEMENT_ORDER,
  AVATAR_IDS,
  AVATAR_LABELS,
  levelForXp,
  xpForLevel,
  type AchievementId,
} from '@voidline/shared';
import { useState } from 'react';
import { Avatar } from '@/components/brand/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useFormSubmit } from '@/hooks/useFormSubmit';
import { cn } from '@/lib/cn';
import { usersApi } from '@/services/users';
import { useSessionStore } from '@/stores/sessionStore';
import { toast } from '@/stores/uiStore';
import { PageHeader } from '@/components/layout/PageHeader';

/**
 * The player's own profile (§33).
 *
 * Every number here is read from the server-issued account. Nothing on this
 * screen can change a stat - the only editable fields are username and avatar,
 * and both go through `PATCH /api/users/me`, which accepts those two fields and
 * nothing else.
 */
export function ProfileScreen() {
  const user = useSessionStore((s) => s.user);
  const setUser = useSessionStore((s) => s.setUser);

  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(user?.username ?? '');
  const [avatar, setAvatar] = useState(user?.avatar ?? AVATAR_IDS[0]);

  const { pending, formError, fieldErrors, submit } = useFormSubmit(
    async (input: { username: string; avatar: string }) => {
      const updated = await usersApi.updateMe(input);
      setUser(updated);
    },
  );

  if (!user) return null;

  const level = levelForXp(user.xp);
  const levelFloor = xpForLevel(level);
  const levelSpan = Math.max(1, xpForLevel(level + 1) - levelFloor);
  const progress = Math.min(100, Math.round(((user.xp - levelFloor) / levelSpan) * 100));

  const unlocked = new Set<AchievementId>(user.achievements.map((a) => a.id));

  async function handleSave() {
    if (await submit({ username, avatar })) {
      setEditing(false);
      toast.success('Profile updated.');
    }
  }

  function startEditing() {
    setUsername(user!.username);
    setAvatar(user!.avatar);
    setEditing(true);
  }

  const stats = [
    { label: 'Matches', value: user.stats.matchesPlayed },
    { label: 'Wins', value: user.stats.matchesWon },
    { label: 'Losses', value: user.stats.matchesLost },
    { label: 'Objectives', value: user.stats.objectivesCompleted },
    { label: 'Eliminations', value: user.stats.eliminations },
    {
      label: 'Win rate',
      // Rounded from the server's derived ratio, so this screen and the
      // leaderboard cannot disagree about the same player.
      value: `${Math.round(user.stats.winRate * 100)}%`,
    },
  ];

  return (
    <main id="main" className="min-h-screen-safe flex flex-col px-safe pb-safe pt-safe">
      <PageHeader title="Profile" />

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 py-4">
        <section className="animate-rise rounded-2xl border border-void-700 bg-void-900 p-5 shadow-panel">
          {editing ? (
            <div className="flex flex-col gap-5">
              <fieldset>
                <legend className="mb-3 text-sm font-medium text-ink-muted">Suit colour</legend>
                <div className="grid grid-cols-4 gap-2.5">
                  {AVATAR_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setAvatar(id)}
                      aria-pressed={avatar === id}
                      aria-label={AVATAR_LABELS[id]}
                      className={cn(
                        'touch-target grid place-items-center rounded-xl border-2 p-1.5 transition-colors',
                        avatar === id
                          ? 'border-signal bg-void-850'
                          : 'border-transparent hover:border-void-600',
                      )}
                    >
                      <Avatar avatarId={id} className="size-full" />
                    </button>
                  ))}
                </div>
              </fieldset>

              <Input
                label="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                error={fieldErrors.username ?? formError}
                hint="3-16 characters. Letters, numbers, underscore or hyphen."
                maxLength={16}
                autoCapitalize="none"
                spellCheck={false}
                disabled={pending}
              />

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="md"
                  fullWidth
                  onClick={() => setEditing(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button size="md" fullWidth loading={pending} onClick={() => void handleSave()}>
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <Avatar
                  avatarId={user.avatar}
                  name={`${user.username}'s avatar`}
                  className="size-16"
                />
                <div className="min-w-0 flex-1">
                  <h1 className="truncate font-display text-xl font-bold text-ink">
                    {user.username}
                  </h1>
                  <p className="text-sm text-ink-muted">
                    Level {level} · {user.xp.toLocaleString()} XP
                  </p>
                </div>
              </div>

              <div className="mt-4">
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

              <Button
                variant="secondary"
                size="sm"
                fullWidth
                className="mt-4"
                onClick={startEditing}
              >
                Edit profile
              </Button>
            </>
          )}
        </section>

        <section className="rounded-2xl border border-void-700 bg-void-900 p-5 shadow-panel">
          <h2 className="font-display text-xs font-bold tracking-[0.2em] text-ink-faint uppercase">
            Record
          </h2>
          <dl className="mt-3 grid grid-cols-3 gap-2.5">
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-xl border border-void-700 bg-void-850 p-3">
                <dt className="truncate text-xs text-ink-faint">{stat.label}</dt>
                <dd className="mt-0.5 font-display text-lg font-bold text-ink">{stat.value}</dd>
              </div>
            ))}
          </dl>
          {user.stats.matchesPlayed === 0 ? (
            <p className="mt-3 text-sm text-ink-faint">
              No matches yet. Your record fills in once you have played one.
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-void-700 bg-void-900 p-5 shadow-panel">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xs font-bold tracking-[0.2em] text-ink-faint uppercase">
              Achievements
            </h2>
            <Badge tone={unlocked.size > 0 ? 'signal' : 'neutral'}>
              {unlocked.size} of {ACHIEVEMENT_ORDER.length}
            </Badge>
          </div>

          <ul className="mt-3 flex flex-col gap-2">
            {ACHIEVEMENT_ORDER.map((id) => {
              const info = ACHIEVEMENTS[id];
              const earned = unlocked.has(id);
              return (
                <li
                  key={id}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3',
                    earned ? 'border-signal/30 bg-signal-glow' : 'border-void-700 bg-void-850',
                  )}
                >
                  {/* A glyph as well as colour, so locked and earned are
                      distinguishable without relying on hue (§46). */}
                  <span
                    aria-hidden
                    className={cn(
                      'grid size-8 shrink-0 place-items-center rounded-lg border text-sm font-bold',
                      earned
                        ? 'border-signal/40 text-signal'
                        : 'border-void-600 text-ink-faint',
                    )}
                  >
                    {earned ? '✓' : '·'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[0.9375rem] font-medium text-ink">{info.name}</p>
                    <p className="mt-0.5 text-sm text-ink-faint">
                      {earned ? info.description : info.hint}
                    </p>
                  </div>
                  <span className="sr-only">{earned ? 'Unlocked' : 'Locked'}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </main>
  );
}
