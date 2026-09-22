'use client';

import { MAP_LABELS, type RoomSummary } from '@voidline/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/brand/Avatar';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, StatusDot } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/StateBlock';
import { ROUTES } from '@/constants/routes';
import { toUserMessage } from '@/services/http';
import { roomsApi } from '@/services/rooms';
import { toast } from '@/stores/uiStore';

/**
 * The lobby, as far as Phase 6 can take it.
 *
 * PHASE 6 SCOPE. This shows the real room fetched from the server - its name,
 * code, host, map, mode and occupancy. What it does not do is show the roster
 * updating as people arrive, because that needs the realtime layer: seats are
 * taken over a socket, not over REST, so that the server can release one when a
 * connection drops.
 *
 * Phase 7 replaces this component with the live lobby and Phase 8 supplies the
 * connection behind it. The banner says so rather than leaving a player staring
 * at a player count that never changes.
 */
export function LobbyPreview({ code }: { code: string }) {
  const router = useRouter();

  const [room, setRoom] = useState<RoomSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void roomsApi
      .preview(code)
      .then((summary) => {
        if (!cancelled) {
          setRoom(summary);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setRoom(null);
          setError(toUserMessage(caught));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code, attempt]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is denied in some browsers and every insecure
      // context. The code is on screen either way, so this is not worth an
      // error state - just do not claim it was copied.
      toast.info('Copy the code manually', code);
    }
  }

  if (error) {
    return (
      <main id="main" className="min-h-screen-safe flex flex-col px-safe pb-safe pt-safe">
        <PageHeader title="Lobby" />
        <ErrorState
          title="Could not open that room"
          description={error}
          onRetry={() => setAttempt((n) => n + 1)}
          className="flex-1"
        />
        <div className="mx-auto w-full max-w-md pb-6">
          <Button variant="secondary" size="md" fullWidth onClick={() => router.replace(ROUTES.home)}>
            Back to home
          </Button>
        </div>
      </main>
    );
  }

  if (!room) {
    return (
      <main id="main" className="min-h-screen-safe flex flex-col px-safe pb-safe pt-safe">
        <PageHeader title="Lobby" />
        <LoadingState label="Opening room" className="flex-1" />
      </main>
    );
  }

  return (
    <main id="main" className="min-h-screen-safe flex flex-col px-safe pb-safe pt-safe">
      <PageHeader title={room.name} />

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 py-4">
        <section className="animate-rise rounded-2xl border border-void-700 bg-void-900 p-5 shadow-panel">
          <p className="text-xs tracking-[0.2em] text-ink-faint uppercase">Room code</p>

          <div className="mt-2 flex items-center gap-3">
            <output className="flex-1 font-mono text-3xl tracking-[0.3em] text-signal">
              {room.code}
            </output>
            <Button variant="secondary" size="sm" onClick={() => void copyCode()}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>

          <p className="mt-2 text-sm text-ink-faint">
            Share this with the people you want in the match.
          </p>
        </section>

        <section className="rounded-2xl border border-void-700 bg-void-900 p-5 shadow-panel">
          <div className="flex items-center gap-3">
            <Avatar avatarId={room.host.avatar} className="size-11" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.9375rem] font-medium text-ink">
                {room.host.username}
              </p>
              <p className="text-sm text-ink-faint">Host</p>
            </div>
            <Badge tone="neutral">
              {room.playerCount}/{room.maxPlayers}
            </Badge>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg border border-void-700 bg-void-850 p-2.5">
              <dt className="text-xs text-ink-faint">Map</dt>
              <dd className="mt-0.5 text-ink">{MAP_LABELS[room.map]}</dd>
            </div>
            <div className="rounded-lg border border-void-700 bg-void-850 p-2.5">
              <dt className="text-xs text-ink-faint">Mode</dt>
              <dd className="mt-0.5 text-ink capitalize">{room.gameMode.toLowerCase()}</dd>
            </div>
          </dl>
        </section>

        {/*
         * Honest about what is not here yet. A player watching a static
         * occupancy count deserves to know it is static, not to conclude that
         * nobody is joining.
         */}
        <section className="rounded-2xl border border-void-700 bg-void-850 p-4">
          <div className="flex items-start gap-2.5">
            <StatusDot tone="caution" pulse />
            <div>
              <p className="text-sm font-medium text-ink">Waiting on the realtime link</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-faint">
                The live roster, ready checks and match start arrive with the realtime layer in
                the next phases. This page shows the room as the server currently has it, and
                does not update on its own yet.
              </p>
            </div>
          </div>
        </section>

        <div className="mt-auto pb-2">
          <Button variant="secondary" size="md" fullWidth onClick={() => router.replace(ROUTES.home)}>
            Leave
          </Button>
        </div>
      </div>
    </main>
  );
}
