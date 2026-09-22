'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GamePhase,
  type SabotageType,
  type Vec2,
} from '@voidline/shared';
import { ROUTES } from '@/constants/routes';
import { toast } from '@/stores/uiStore';
import { useGameStore } from '@/stores/gameStore';
import { useSessionStore } from '@/stores/sessionStore';
import { GameCanvas } from './GameCanvas';
import { CouncilScreen } from './CouncilScreen';
import { GameHud } from './GameHud';
import { MatchResults } from './MatchResults';
import { RoleReveal } from './RoleReveal';

/**
 * The match screen.
 *
 * One component that switches on the server's phase and nothing else. The
 * client never decides that a match has moved on - it is told, by
 * `GameSnapshot.phase`, and it renders whatever that says.
 *
 *   STARTING              the private role reveal
 *   PLAYING | SABOTAGE    the canvas and the HUD
 *   COUNCIL | VOTING      the council
 *   EJECTION              the council, showing the airlock
 *   RESULTS | ENDED       the results
 *
 * The canvas stays mounted underneath the council so that returning to play
 * does not restart the engine, reload the map or re-snap the camera.
 */
export function GameScreen({ code }: { code: string }) {
  const router = useRouter();
  const viewer = useSessionStore((s) => s.user);

  const snapshot = useGameStore((s) => s.snapshot);
  const self = useGameStore((s) => s.self);
  const chat = useGameStore((s) => s.chat);
  const result = useGameStore((s) => s.result);
  const votingResult = useGameStore((s) => s.votingResult);

  const subscribe = useGameStore((s) => s.subscribe);
  const resume = useGameStore((s) => s.resume);

  const [revealDismissed, setRevealDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribe();
    /*
     * Ask for the current state on mount.
     *
     * A player who reloads mid-match, or who navigates here after `game:start`
     * has already been broadcast, has missed the event that would have seeded
     * the store. `game:resume` rebuilds it from the server.
     */
    void resume().catch(() => {
      // Not in a match, or the room has gone. The empty state below covers it.
    });
    return unsubscribe;
  }, [subscribe, resume]);

  /*
   * PROXIMITY, and its known limitation.
   *
   * These pick the nearest candidate from the last `game:state` snapshot,
   * which is event-driven - positions in it can be a second or more stale,
   * because live movement goes straight to the canvas on `game:delta` and
   * deliberately never enters the store.
   *
   * That is good enough to *choose* a target and not good enough to *gate*
   * one, so nothing here is disabled on distance: the server re-checks range
   * on every action and answers OUT_OF_RANGE, which is surfaced as a readable
   * message rather than swallowed. The right fix is a proximity hook on the
   * engine, which owns the authoritative local positions.
   */
  const me = snapshot?.players.find((player) => player.id === self?.self.id) ?? null;

  const nearestPlayerId = useMemo(() => {
    if (!snapshot || !me || !me.alive) return null;
    return nearestBy(
      snapshot.players.filter((player) => player.id !== me.id && player.alive),
      me.position,
      (player) => player.position,
    )?.id ?? null;
  }, [snapshot, me]);

  const nearestBodyId = useMemo(() => {
    if (!snapshot || !me) return null;
    return nearestBy(
      snapshot.bodies.filter((body) => !body.reported),
      me.position,
      (body) => body.position,
    )?.id ?? null;
  }, [snapshot, me]);

  /** The first objective still to do. Range is the server's business. */
  const nextTaskId = useMemo(
    () => self?.tasks.find((task) => task.status !== 'COMPLETE')?.id ?? null,
    [self],
  );

  /** Runs a server action, turning a rejection into something readable. */
  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'That did not work.';
      toast.danger(label, message);
    } finally {
      setBusy(false);
    }
  }

  const store = useGameStore.getState;

  /* ------------------------------------------------------------ gates - */

  if (result) {
    return (
      <MatchResults
        result={result}
        viewerId={viewer?.id ?? ''}
        onContinue={() => router.push(ROUTES.home)}
      />
    );
  }

  if (!snapshot || !self) {
    return (
      <main className="station-backdrop min-h-screen-safe grid place-items-center px-safe">
        <p className="text-sm text-ink-muted">Waiting for the station…</p>
      </main>
    );
  }

  const inCouncil =
    snapshot.phase === GamePhase.COUNCIL ||
    snapshot.phase === GamePhase.VOTING ||
    snapshot.phase === GamePhase.EJECTION;

  const showReveal = snapshot.phase === GamePhase.STARTING && !revealDismissed;

  /* ----------------------------------------------------------- render - */

  return (
    <main id="main" className="h-screen-safe relative w-full overflow-hidden">
      {/*
       * The canvas stays mounted through the council, just hidden. Unmounting
       * it would tear down the engine and reload the map every meeting.
       */}
      <div className={inCouncil ? 'invisible absolute inset-0' : 'absolute inset-0'}>
        <GameCanvas />
      </div>

      {inCouncil ? (
        <CouncilScreen
          snapshot={snapshot}
          self={self}
          chat={chat}
          votingResult={votingResult}
          onVote={(target) => run('Vote refused', () => store().vote(target))}
          onSendChat={(channel, body) =>
            run('Message not sent', () => store().sendChat(channel, body))
          }
        />
      ) : (
        <GameHud
          snapshot={snapshot}
          self={self}
          nearestPlayerId={nearestPlayerId}
          nearestBodyId={nearestBodyId}
          interactableTaskId={nextTaskId}
          busy={busy}
          onInteract={(taskId) =>
            void run('Cannot use that terminal', () => store().startTask(taskId))
          }
          onEliminate={(targetId) =>
            void run('Elimination refused', () => store().eliminate(targetId))
          }
          onReport={(bodyId) => void run('Cannot report', () => store().reportBody(bodyId))}
          onEmergency={() => void run('Cannot call a meeting', () => store().callEmergency())}
          onSabotage={(type: SabotageType) =>
            void run('Sabotage refused', () => store().sabotage(type))
          }
          onOpenMenu={() => router.push(ROUTES.lobby(code))}
        />
      )}

      {showReveal ? (
        <RoleReveal
          role={self.self.role}
          username={self.self.username}
          avatarId={self.self.avatar}
          appearance={self.self.appearance}
          onDismiss={() => setRevealDismissed(true)}
          startsAt={snapshot.timer.endsAt}
        />
      ) : null}
    </main>
  );
}

/* -------------------------------------------------------------- helper - */

/** The closest item to a point, or null when the list is empty. */
function nearestBy<T>(items: readonly T[], from: Vec2, positionOf: (item: T) => Vec2): T | null {
  let best: T | null = null;
  let bestDistance = Infinity;

  for (const item of items) {
    const position = positionOf(item);
    const distance = (position.x - from.x) ** 2 + (position.y - from.y) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = item;
    }
  }

  return best;
}
