'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import {
  GamePhase,
  type SabotageType,

} from '@voidline/shared';
import { ROUTES } from '@/constants/routes';
import { toast } from '@/stores/uiStore';
import { useProximity } from '@/hooks/useProximity';
import type { Engine } from '@/game/engine/Engine';
import { useGameStore } from '@/stores/gameStore';
import { useSessionStore } from '@/stores/sessionStore';
import { GameCanvas } from './GameCanvas';
import { CouncilScreen } from './CouncilScreen';
import { GameHud } from './GameHud';
import { RoleReveal } from './RoleReveal';
import { TaskPanel } from './tasks/TaskPanel';

/**
 * The results screen, split into its own chunk.
 *
 * It is reached once, at the end of a match, and it pulls in the Cat artwork
 * and the XP panel - none of which is needed while anybody is playing. The
 * fetch happens at the one moment in the match with no time pressure at all.
 *
 * `RoleReveal` is deliberately NOT split. It renders during STARTING with
 * about five seconds of budget, and a chunk arriving late there would mean
 * the reveal lands after the match has already begun.
 */
const MatchResults = dynamic(() => import('./MatchResults').then((m) => m.MatchResults), {
  loading: () => (
    <main className="station-backdrop min-h-screen-safe grid place-items-center px-safe">
      <p className="text-sm text-ink-muted">Counting up…</p>
    </main>
  ),
});

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
  const puzzle = useGameStore((s) => s.puzzle);

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
   * PROXIMITY, from the engine rather than from the snapshot.
   *
   * The engine owns the authoritative local positions; `game:state` carries
   * positions that can be a second stale, because live movement goes straight
   * to the canvas on `game:delta` and deliberately never enters the store.
   * Targeting off the snapshot worked but showed Eliminate as available while
   * standing alone in a corridor.
   *
   * It still decides nothing. `nearest` reads public world state only - it
   * knows nothing about roles, cooldowns or whose objective a terminal is -
   * and the server re-checks range on every action. An action offered here
   * can still be refused, and the refusal is surfaced as a message.
   */
  const [engine, setEngine] = useState<Engine | null>(null);
  const proximity = useProximity(engine, snapshot?.phase === GamePhase.PLAYING);

  const nearestPlayerId = self?.self.alive ? (proximity.player?.id ?? null) : null;
  const nearestBodyId = proximity.body?.id ?? null;

  /**
   * The objective at the terminal being stood on, if it is one of yours.
   *
   * Matching the terminal to the assignment is what makes Interact mean
   * something: standing at Reactor with no reactor objective should offer
   * nothing, rather than offering to start a task somewhere else entirely.
   */
  const interactableTaskId = useMemo(() => {
    const terminalId = proximity.terminal?.id;
    if (!terminalId || !self) return null;

    return (
      self.tasks.find((task) => task.terminalId === terminalId && task.status !== 'COMPLETE')?.id ??
      null
    );
  }, [proximity.terminal?.id, self]);

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

  /**
   * Shuts the objective panel.
   *
   * Closing is purely local - the server has no notion of a panel being open,
   * only of steps submitted - so this clears the store's copy directly rather
   * than round-tripping. Re-opening the terminal issues a fresh puzzle.
   */
  function closeTask() {
    useGameStore.setState({ puzzle: null });
  }

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
        <GameCanvas onEngineReady={setEngine} />
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
          interactableTaskId={interactableTaskId}
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

      {/*
       * An open objective. Not lazy-loaded: it opens mid-match against the
       * puzzle's own time budget, which is no place for a cold chunk fetch.
       */}
      {puzzle ? (
        <TaskPanel
          key={`${puzzle.taskId}:${puzzle.step}`}
          puzzle={puzzle}
          onSubmit={(values, elapsedMs) => store().submitStep(values, elapsedMs)}
          onClose={closeTask}
        />
      ) : null}

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
