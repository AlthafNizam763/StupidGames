'use client';

import {
  PlayerRole,
  Team,
  xpForLevel,
  type CharacterAppearance,
  type MatchPlayerResult,
  type MatchResult,
} from '@voidline/shared';
import { Badge, Button } from '@/components/ui';
import { CatCharacter, CharacterBust, HumanCharacter } from '@/components/character';
import { TEAM_VICTORY_HEADLINE, WIN_REASON_COPY, roleIdentity } from '@/lib/fiction';
import { cn } from '@/lib/cn';

/**
 * The results screen (§Z, §AA, §AB).
 *
 * The only screen in the game where roles are public, and the reason the
 * whole thing is worth playing: this is where everyone finds out whether the
 * quiet one in Reactor was the Cat.
 *
 * It is entirely prop-driven from `MatchResult`, which the server computes -
 * winner, reason, duration, every player's role and outcome, and every XP
 * figure. The client never derives an outcome and never adds up XP: it is
 * handed the numbers and lays them out.
 *
 * WHY IT IS SAFE to render the Cat here, when no other screen may: the match
 * is over. `MatchResult.players[].role` is sent to everybody at this point,
 * deliberately, because concealing it after the final whistle would rob the
 * game of its payoff. Everywhere else, role is absent from the payload.
 */

export interface MatchResultsProps {
  result: MatchResult;
  /** Which row is the person looking at the screen. */
  viewerId: string;
  onContinue?: () => void;
  onRematch?: () => void;
}

export function MatchResults({ result, viewerId, onContinue, onRematch }: MatchResultsProps) {
  const you = result.players.find((player) => player.userId === viewerId) ?? null;
  const catWon = result.winner === Team.SABOTEURS;

  // Won or lost is asked from the viewer's seat, not the winner's. The same
  // payload produces a different headline for each person reading it.
  const youWon = you ? teamOf(you.role) === result.winner : null;

  return (
    <main
      className={cn(
        'min-h-screen-safe flex flex-col items-center px-safe py-8',
        catWon ? 'cat-backdrop' : 'station-backdrop',
      )}
    >
      <div className="flex w-full max-w-2xl flex-col gap-6">
        {/* ----------------------------------------------------- verdict - */}

        <header className="animate-pop flex flex-col items-center text-center">
          {you ? (
            <p
              className={cn(
                'font-mono text-xs tracking-[0.35em] uppercase',
                youWon ? 'text-signal' : 'text-ink-faint',
              )}
            >
              {youWon ? 'Victory' : 'Defeat'}
            </p>
          ) : null}

          <h1
            className={cn(
              'mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl',
              catWon ? 'text-cat' : 'text-signal',
            )}
          >
            {TEAM_VICTORY_HEADLINE[result.winner]}
          </h1>

          <p className="mt-3 max-w-md text-[0.9375rem] text-ink-muted">
            {WIN_REASON_COPY[result.reason]}
          </p>

          {/*
           * The winning side, drawn. The Cat appears here and only here on a
           * shared screen, because the match has ended and the payload now
           * says who it was.
           */}
          <div className="mt-6 flex items-end justify-center gap-2">
            {catWon ? (
              <CatCharacter
                expression="SMIRK"
                animated
                name="The Cat wins"
                className="size-36 sm:size-44"
              />
            ) : (
              result.players
                .filter((player) => player.role === PlayerRole.OPERATOR && player.survived)
                .slice(0, 4)
                .map((player) => (
                  <HumanCharacter
                    key={player.userId}
                    appearance={player.appearance}
                    avatarId={player.avatar}
                    expression="HAPPY"
                    pose="CHEER"
                    animated
                    name={player.username}
                    className="size-24 sm:size-28"
                  />
                ))
            )}
          </div>

          <p className="mt-4 font-mono text-xs text-ink-faint tabular-nums">
            {formatDuration(result.duration)} · {result.players.length} crew
          </p>
        </header>

        {/* ------------------------------------------------------ roster - */}

        <section className="rounded-2xl border border-void-700 bg-void-900/80 p-1">
          <h2 className="px-4 pt-3 pb-2 font-mono text-xs tracking-[0.2em] text-ink-faint uppercase">
            Crew manifest
          </h2>

          <ul className="flex flex-col">
            {[...result.players]
              // Winners first, then survivors, then by name - so the story of
              // the match reads top to bottom instead of in join order.
              .sort(sortForResults(result.winner))
              .map((player) => (
                <PlayerRow
                  key={player.userId}
                  player={player}
                  appearance={player.appearance}
                  isViewer={player.userId === viewerId}
                />
              ))}
          </ul>
        </section>

        {/* ---------------------------------------------------------- xp - */}

        {you ? <XpPanel player={you} /> : null}

        {/* ----------------------------------------------------- actions - */}

        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          {onRematch ? (
            <Button fullWidth onClick={onRematch}>
              Play again
            </Button>
          ) : null}
          {onContinue ? (
            <Button variant="secondary" fullWidth onClick={onContinue}>
              Back to home
            </Button>
          ) : null}
        </div>
      </div>
    </main>
  );
}

/* ----------------------------------------------------------- roster row - */

function PlayerRow({
  player,
  appearance,
  isViewer,
}: {
  player: MatchPlayerResult;
  appearance: CharacterAppearance;
  isViewer: boolean;
}) {
  const identity = roleIdentity(player.role);
  const isCat = player.role === PlayerRole.SABOTEUR;

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2.5',
        isViewer && 'bg-void-800/70',
      )}
    >
      <CharacterBust
        userId={player.userId}
        username={player.username}
        avatarId={player.avatar}
        appearance={appearance}
        expression={player.survived ? 'NORMAL' : 'DEAD'}
        className="size-11"
      />

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate text-[0.9375rem] font-medium text-ink">
          {player.username}
          {isViewer ? <span className="text-xs text-ink-faint">(you)</span> : null}
        </p>
        <p className="truncate text-xs text-ink-faint tabular-nums">
          {player.objectivesCompleted} objectives
          {player.eliminations > 0 ? ` · ${player.eliminations} eliminated` : ''}
        </p>
      </div>

      {/*
       * Role and outcome as text, not colour alone. The Cat gets the violet
       * accent it has earned by this point - the match is over and there is
       * nothing left to give away.
       */}
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge tone={isCat ? 'alert' : 'signal'} className={cn(isCat && 'border-cat/40 bg-cat-glow text-cat')}>
          {identity.display}
        </Badge>
        {/*
         * Coloured by survival, not by which side won.
         *
         * Tying the colour to `won` produced "Eliminated" in green for a
         * winning player, which reads as a contradiction. Who won is already
         * carried by the headline and by the order of this list; this line
         * answers a different question.
         */}
        <span className={cn('text-xs', player.survived ? 'text-signal' : 'text-ink-faint')}>
          {player.survived ? 'Survived' : 'Eliminated'}
        </span>
      </div>
    </li>
  );
}

/* -------------------------------------------------------------- xp panel - */

/**
 * The XP award (§AB).
 *
 * Every figure here is server-computed and arrives in the payload. The bar
 * shows progress within the new level, which is what a player is actually
 * asking about - "how close am I" - rather than progress toward a lifetime
 * total that only ever creeps.
 */
function XpPanel({ player }: { player: MatchPlayerResult }) {
  const levelledUp = player.levelAfter > player.levelBefore;

  const floor = xpForLevel(player.levelAfter);
  const span = Math.max(1, xpForLevel(player.levelAfter + 1) - floor);
  // Total XP is not in the payload, only what this match awarded, so progress
  // is shown within the level the player finished on.
  const progress = Math.min(100, Math.round((Math.min(player.xpEarned, span) / span) * 100));

  return (
    <section className="rounded-2xl border border-void-700 bg-void-900/80 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-mono text-xs tracking-[0.2em] text-ink-faint uppercase">Match XP</h2>
        <p className="font-display text-2xl font-bold text-signal tabular-nums">
          +{player.xpEarned.toLocaleString()}
        </p>
      </div>

      <ul className="mt-3 flex flex-col gap-1.5">
        {player.xpBreakdown.map((line) => (
          <li key={line.label} className="flex justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-ink-muted">{line.label}</span>
            <span className="shrink-0 text-ink tabular-nums">+{line.amount}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-xs text-ink-faint">
          <span>
            Level {player.levelBefore}
            {levelledUp ? ` → ${player.levelAfter}` : ''}
          </span>
          {levelledUp ? <span className="text-signal">Level up</span> : null}
        </div>
        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Progress through level ${player.levelAfter}`}
          className="h-2 overflow-hidden rounded-full bg-void-800"
        >
          <div className="animate-fill h-full rounded-full bg-signal" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {player.unlocked.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {player.unlocked.map((id) => (
            <Badge key={id} tone="caution">
              Achievement unlocked
            </Badge>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/* --------------------------------------------------------------- helpers - */

function teamOf(role: PlayerRole): Team {
  return role === PlayerRole.SABOTEUR ? Team.SABOTEURS : Team.OPERATORS;
}

function sortForResults(winner: Team) {
  return (a: MatchPlayerResult, b: MatchPlayerResult): number => {
    const aWon = teamOf(a.role) === winner ? 0 : 1;
    const bWon = teamOf(b.role) === winner ? 0 : 1;
    if (aWon !== bWon) return aWon - bWon;
    if (a.survived !== b.survived) return a.survived ? -1 : 1;
    return a.username.localeCompare(b.username);
  };
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}m ${rest.toString().padStart(2, '0')}s`;
}
