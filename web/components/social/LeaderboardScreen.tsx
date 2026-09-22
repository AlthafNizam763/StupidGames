'use client';

import { useEffect, useState } from 'react';
import {
  LeaderboardScope,
  levelForXp,
  type LeaderboardEntry,
} from '@voidline/shared';
import { CharacterBust } from '@/components/character';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { socialApi } from '@/services/social';
import { useSessionStore } from '@/stores/sessionStore';
import { toast } from '@/stores/uiStore';
import { cn } from '@/lib/cn';

/**
 * The leaderboard (§AE).
 *
 * Three scopes, all computed server-side. LOCALITY in particular is derived
 * from something the server knows and the client never sends - a client-
 * supplied region would be a client-chosen leaderboard.
 *
 * Presented as a standing, not a report. Rank is the largest thing on a row,
 * the top three get their own colour, and the viewer's own row is marked
 * wherever it falls - the single question anybody opens this screen to answer
 * is "where am I", and scrolling a table to find yourself is a poor way to be
 * told.
 */

const SCOPES: ReadonlyArray<{ id: LeaderboardScope; label: string; empty: string }> = [
  { id: LeaderboardScope.WORLD, label: 'World', empty: 'Nobody has finished a match yet.' },
  {
    id: LeaderboardScope.FRIENDS,
    label: 'Friends',
    empty: 'Add some friends and their standings appear here.',
  },
  { id: LeaderboardScope.LOCALITY, label: 'Nearby', empty: 'No ranked players near you yet.' },
];

export function LeaderboardScreen() {
  const [scope, setScope] = useState<LeaderboardScope>(LeaderboardScope.WORLD);

  return (
    <main id="main" className="min-h-screen-safe flex flex-col px-safe pb-safe pt-safe">
      <PageHeader title="Leaderboard" />

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 py-4">
        {/* -------------------------------------------------------- tabs - */}

        <div role="tablist" aria-label="Leaderboard scope" className="flex gap-1 rounded-xl bg-void-900 p-1">
          {SCOPES.map((entry) => (
            <button
              key={entry.id}
              role="tab"
              aria-selected={entry.id === scope}
              onClick={() => setScope(entry.id)}
              className={cn(
                'touch-target flex-1 rounded-lg text-sm font-medium transition-colors',
                entry.id === scope ? 'bg-void-700 text-ink' : 'text-ink-muted hover:text-ink',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {/* ------------------------------------------------------- table - */}

        {/*
         * Keyed on the scope, so switching tabs remounts with empty state
         * rather than clearing the previous list from inside an effect. It
         * also makes the stale-response guard unnecessary: a response from
         * the scope you just left arrives at a component that no longer
         * exists.
         */}
        <Standings key={scope} scope={scope} />
      </div>
    </main>
  );
}

/* ---------------------------------------------------------- standings - */

function Standings({ scope }: { scope: LeaderboardScope }) {
  const viewer = useSessionStore((s) => s.user);

  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [viewerRank, setViewerRank] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    socialApi
      .leaderboard(scope)
      .then((page) => {
        setEntries(page.items);
        setViewerRank(page.viewerRank);
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, [scope, attempt]);

  const active = SCOPES.find((entry) => entry.id === scope) ?? SCOPES[0]!;

  if (failed) {
    return (
      <ErrorState
        title="Could not load the standings"
        description="The station did not answer."
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
  }

  if (entries === null) return <LoadingState label="Loading standings" />;
  if (entries.length === 0) {
    return <EmptyState title="Nothing here yet" description={active.empty} />;
  }

  return (
    <>
      {viewerRank !== null ? (
        <p className="mb-3 text-center text-sm text-ink-muted">
          You are <span className="font-mono font-bold text-signal">#{viewerRank}</span> in this
          standing.
        </p>
      ) : null}

      <ol className="flex flex-col gap-1.5">
        {entries.map((entry) => (
          <Row key={entry.id} entry={entry} isViewer={entry.id === viewer?.id} />
        ))}
      </ol>
    </>
  );
}

/* ----------------------------------------------------------------- row - */

function Row({ entry, isViewer }: { entry: LeaderboardEntry; isViewer: boolean }) {
  // Podium colours for the top three. Below that rank is just a number, and
  // colouring all twenty-five would make none of them mean anything.
  const podium =
    entry.rank === 1
      ? 'text-caution'
      : entry.rank === 2
        ? 'text-ink'
        : entry.rank === 3
          ? 'text-[#c87f4a]'
          : 'text-ink-faint';

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-xl border p-2.5',
        isViewer ? 'border-signal/40 bg-signal-glow' : 'border-void-700 bg-void-900',
      )}
    >
      <span
        className={cn('w-8 shrink-0 text-center font-mono text-lg font-bold tabular-nums', podium)}
      >
        {entry.rank}
      </span>

      <CharacterBust
        userId={entry.id}
        username={entry.username}
        avatarId={entry.avatar}
        appearance={entry.appearance}
        className="size-11"
      />

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-[0.9375rem] font-medium text-ink">
          {entry.username}
          {isViewer ? <span className="text-xs text-ink-faint">(you)</span> : null}
        </p>
        <p className="truncate text-xs text-ink-faint tabular-nums">
          {entry.wins} {entry.wins === 1 ? 'win' : 'wins'} from {entry.matchesPlayed}
        </p>
      </div>

      <Badge tone={isViewer ? 'signal' : 'neutral'}>Lv {levelForXp(entry.xp)}</Badge>

      {isViewer ? null : <AddFriendButton userId={entry.id} username={entry.username} />}
    </li>
  );
}

/**
 * Send a friend request to somebody on the board.
 *
 * This is where adding a friend belongs, and for a concrete reason: the
 * endpoint takes a user id, and this is one of the few places a player is
 * holding one. A "type a username" box on the friends screen cannot work -
 * there is no lookup - and building one anyway would be a form that always
 * fails.
 *
 * Deliberately fire-and-forget. The row does not re-fetch or change state
 * beyond its own button, because the leaderboard is not a friends list and
 * should not start behaving like one.
 */
function AddFriendButton({ userId, username }: { userId: string; username: string }) {
  const [state, setState] = useState<'IDLE' | 'SENDING' | 'SENT'>('IDLE');

  async function send() {
    setState('SENDING');
    try {
      await socialApi.requestFriend({ userId });
      setState('SENT');
      toast.success(`Request sent to ${username}.`);
    } catch (error) {
      setState('IDLE');
      toast.danger(
        'Could not send that request',
        error instanceof Error ? error.message : 'Try again in a moment.',
      );
    }
  }

  if (state === 'SENT') {
    return (
      <span className="shrink-0 px-2 font-mono text-[0.625rem] text-ink-faint uppercase">Sent</span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void send()}
      disabled={state === 'SENDING'}
      aria-label={`Send a friend request to ${username}`}
      className="touch-target grid shrink-0 place-items-center rounded-lg text-ink-faint
                 transition-colors hover:text-signal disabled:opacity-40"
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-5">
        <path
          d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M22 11h-6"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
