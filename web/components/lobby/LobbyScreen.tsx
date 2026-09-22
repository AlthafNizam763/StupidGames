'use client';

import {
  ConnectionState,
  MAP_LABELS,
  MIN_PLAYERS_TO_START,
  isMatchPhase,
  type LobbyPlayer,
} from '@voidline/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CharacterBust } from '@/components/character';
import { PageHeader } from '@/components/layout/PageHeader';
import { Badge, StatusDot } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/StateBlock';
import { ROUTES } from '@/constants/routes';
import { cn } from '@/lib/cn';
import { SocketError } from '@/services/socket';
import { useRoomStore } from '@/stores/roomStore';
import { useSessionStore } from '@/stores/sessionStore';
import { toast } from '@/stores/uiStore';

/**
 * The live lobby (§13).
 *
 * Everything on screen comes from the last `room:state` the server broadcast.
 * Nothing is applied optimistically: tapping Ready asks the server and waits.
 * A lobby is shared, and a client that renders its own guess shows one player
 * something the others do not see.
 */

function ConnectionBadge({ state }: { state: ConnectionState }) {
  if (state === ConnectionState.CONNECTED) return null;

  // Only the abnormal states get a badge. A row with no badge is connected,
  // which keeps a healthy lobby free of eight identical labels.
  return state === ConnectionState.RECONNECTING ? (
    <Badge tone="caution" icon={<StatusDot tone="caution" pulse />}>
      Reconnecting
    </Badge>
  ) : (
    <Badge tone="neutral">Offline</Badge>
  );
}

function PlayerRow({
  player,
  isSelf,
  canKick,
  onKick,
}: {
  player: LobbyPlayer;
  isSelf: boolean;
  canKick: boolean;
  onKick: () => void;
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-xl border p-2.5 transition-colors',
        player.connection === ConnectionState.CONNECTED
          ? 'border-void-700 bg-void-850'
          : 'border-void-700/60 bg-void-900/60',
      )}
    >
      {/*
       * The crew member, not a suit icon. Everyone in this list is someone
       * you are about to have to read, so the lobby should be where you
       * start learning what they look like.
       */}
      <CharacterBust
        userId={player.userId}
        username={player.username}
        avatarId={player.avatar}
        appearance={player.appearance}
        className="size-11"
      />

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-[0.9375rem] font-medium text-ink">
          <span className="truncate">{player.username}</span>
          {isSelf ? <span className="shrink-0 text-xs text-ink-faint">(you)</span> : null}
        </p>
        <p className="flex items-center gap-2 text-sm text-ink-faint">
          <span>Level {player.level}</span>
          {player.isHost ? <span className="text-beacon">Host</span> : null}
        </p>
      </div>

      <ConnectionBadge state={player.connection} />

      {/*
       * Ready state carries a glyph as well as a colour, so it survives a
       * colour vision deficiency (§46). The host is always ready - they are
       * the one who starts - so their row shows nothing.
       */}
      {!player.isHost ? (
        <span
          className={cn(
            'grid size-8 shrink-0 place-items-center rounded-lg border text-sm font-bold',
            player.isReady
              ? 'border-signal/40 bg-signal-glow text-signal'
              : 'border-void-600 text-ink-faint',
          )}
          aria-label={player.isReady ? 'Ready' : 'Not ready'}
        >
          <span aria-hidden>{player.isReady ? '✓' : '·'}</span>
        </span>
      ) : null}

      {canKick ? (
        <button
          type="button"
          onClick={onKick}
          aria-label={`Remove ${player.username}`}
          className="touch-target grid shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-alert-glow hover:text-alert"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-4">
            <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </li>
  );
}

export function LobbyScreen({ code }: { code: string }) {
  const router = useRouter();
  const user = useSessionStore((s) => s.user);

  const room = useRoomStore((s) => s.room);
  const connection = useRoomStore((s) => s.connection);
  const exitReason = useRoomStore((s) => s.exitReason);
  const subscribe = useRoomStore((s) => s.subscribe);
  const joinRoom = useRoomStore((s) => s.joinRoom);
  const leaveRoom = useRoomStore((s) => s.leaveRoom);
  const setReady = useRoomStore((s) => s.setReady);
  const kick = useRoomStore((s) => s.kick);
  const closeRoom = useRoomStore((s) => s.closeRoom);
  const startMatch = useRoomStore((s) => s.startMatch);

  const [joinError, setJoinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const joined = useRef(false);

  // Listeners first, then join - otherwise the `room:state` that the join
  // triggers can arrive before anything is listening for it.
  useEffect(() => subscribe(), [subscribe]);

  useEffect(() => {
    if (joined.current) return;
    joined.current = true;

    void joinRoom(code).catch((error: unknown) => {
      setJoinError(error instanceof Error ? error.message : 'Could not join that room.');
    });
  }, [code, joinRoom]);

  // The host closed the room, or this player was removed. Either way the room
  // is gone and there is nothing here to look at.
  useEffect(() => {
    if (!exitReason) return;
    toast.info(exitReason);
    router.replace(ROUTES.home);
  }, [exitReason, router]);

  /*
   * The match has begun - this screen is no longer the one to be looking at.
   *
   * `room:start` answers the host with an ack and nothing more: the screen
   * change comes from the phase in the `room:state` the server broadcasts to
   * everyone. Driving it from the phase rather than from the ack means every
   * seat leaves on the same signal, so the host is not special-cased, and a
   * player who was reconnecting when the match started is carried in as soon
   * as their state arrives.
   *
   * Without this the room moved to STARTING while every client sat in the
   * lobby, and a second press of Start was refused with "the match is not in
   * the lobby" - the room had already left it.
   *
   * `replace`, not `push`: there is no lobby to go back to, and going back
   * would only land here and bounce straight out again.
   */
  const phase = room?.phase;
  const roomCode = room?.code;

  useEffect(() => {
    if (!phase || !roomCode || !isMatchPhase(phase)) return;
    router.replace(ROUTES.game(roomCode));
  }, [phase, roomCode, router]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.danger(
        error instanceof SocketError || error instanceof Error
          ? error.message
          : 'That did not work.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.info('Copy the code manually', code);
    }
  }

  if (joinError) {
    return (
      <main id="main" className="min-h-screen-safe flex flex-col px-safe pb-safe pt-safe">
        <PageHeader title="Lobby" />
        <ErrorState title="Could not join" description={joinError} className="flex-1" />
        <div className="mx-auto w-full max-w-md pb-6">
          <Button variant="secondary" size="md" fullWidth onClick={() => router.replace(ROUTES.home)}>
            Back to home
          </Button>
        </div>
      </main>
    );
  }

  if (!room || !user) {
    return (
      <main id="main" className="min-h-screen-safe flex flex-col px-safe pb-safe pt-safe">
        <PageHeader title="Lobby" />
        <LoadingState label="Joining room" className="flex-1" />
      </main>
    );
  }

  const isHost = room.hostId === user.id;
  const self = room.players.find((player) => player.userId === user.id);
  const connected = room.players.filter((p) => p.connection === ConnectionState.CONNECTED);
  const notReady = connected.filter((p) => !p.isReady);

  /*
   * The same preconditions the server enforces, mirrored here so the host can
   * see what is missing instead of pressing a button to find out. The server
   * re-checks all of it - this only decides what to render.
   */
  const startBlocker =
    connected.length < MIN_PLAYERS_TO_START
      ? `${MIN_PLAYERS_TO_START} connected players needed — there ${connected.length === 1 ? 'is' : 'are'} ${connected.length}.`
      : notReady.length > 0
        ? notReady.length === 1
          ? `${notReady[0]?.username} is not ready.`
          : `${notReady.length} players are not ready.`
        : null;

  return (
    <main id="main" className="min-h-screen-safe flex flex-col px-safe pb-safe pt-safe">
      <PageHeader
        title={room.settings.name}
        action={
          connection === 'reconnecting' ? (
            <Badge tone="caution" icon={<StatusDot tone="caution" pulse />}>
              Reconnecting
            </Badge>
          ) : null
        }
      />

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 py-2">
        <section className="rounded-2xl border border-void-700 bg-void-900 p-5 shadow-panel">
          <p className="text-xs tracking-[0.2em] text-ink-faint uppercase">Room code</p>
          <div className="mt-2 flex items-center gap-3">
            <output className="flex-1 font-mono text-3xl tracking-[0.3em] text-signal">
              {room.code}
            </output>
            <Button variant="secondary" size="sm" onClick={() => void copyCode()}>
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </section>

        <section className="rounded-2xl border border-void-700 bg-void-900 p-5 shadow-panel">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xs font-bold tracking-[0.2em] text-ink-faint uppercase">
              Crew
            </h2>
            <span className="font-mono text-sm text-ink-muted tabular-nums">
              {room.players.length}/{room.settings.maxPlayers}
            </span>
          </div>

          <ul className="mt-3 flex flex-col gap-2">
            {room.players.map((player) => (
              <PlayerRow
                key={player.userId}
                player={player}
                isSelf={player.userId === user.id}
                canKick={isHost && player.userId !== user.id}
                onKick={() => void run(() => kick(player.userId))}
              />
            ))}
          </ul>

          {room.players.length < MIN_PLAYERS_TO_START ? (
            <p className="mt-3 text-sm text-ink-faint">
              Share the code above. {MIN_PLAYERS_TO_START} players are needed to start.
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-void-700 bg-void-900 p-5 shadow-panel">
          <h2 className="font-display text-xs font-bold tracking-[0.2em] text-ink-faint uppercase">
            Match settings
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {[
              { label: 'Map', value: MAP_LABELS[room.settings.map] },
              { label: 'Mode', value: room.settings.gameMode.toLowerCase() },
              { label: 'Saboteurs', value: String(room.settings.saboteurCount) },
              { label: 'Objectives', value: String(room.settings.objectiveCount) },
              { label: 'Discussion', value: `${room.settings.discussionTime}s` },
              { label: 'Voting', value: `${room.settings.votingTime}s` },
              { label: 'Elim. cooldown', value: `${room.settings.killCooldown}s` },
              {
                label: 'Emergencies',
                value: room.settings.emergencyMeetingLimit === 0
                  ? 'Off'
                  : String(room.settings.emergencyMeetingLimit),
              },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-void-700 bg-void-850 p-2.5">
                <dt className="text-xs text-ink-faint">{item.label}</dt>
                <dd className="mt-0.5 text-ink capitalize">{item.value}</dd>
              </div>
            ))}
          </dl>

          {isHost ? (
            <p className="mt-3 text-sm text-ink-faint">
              Settings can be changed over the wire, but the host-side editing form is not built
              yet.
            </p>
          ) : null}
        </section>

        <div className="mt-auto flex flex-col gap-2 pb-2">
          {isHost ? (
            <>
              <Button
                size="lg"
                fullWidth
                loading={busy}
                disabled={Boolean(startBlocker)}
                onClick={() => void run(startMatch)}
              >
                Start match
              </Button>
              {startBlocker ? (
                <p className="text-center text-sm text-ink-faint">{startBlocker}</p>
              ) : null}
              <Button
                variant="danger"
                size="md"
                fullWidth
                disabled={busy}
                onClick={() => void run(closeRoom)}
              >
                Close room
              </Button>
            </>
          ) : (
            <>
              <Button
                size="lg"
                fullWidth
                variant={self?.isReady ? 'secondary' : 'primary'}
                loading={busy}
                onClick={() => void run(() => setReady(!self?.isReady))}
              >
                {self?.isReady ? 'Not ready' : 'Ready'}
              </Button>
              <Button
                variant="ghost"
                size="md"
                fullWidth
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await leaveRoom();
                    router.replace(ROUTES.home);
                  })
                }
              >
                Leave room
              </Button>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
