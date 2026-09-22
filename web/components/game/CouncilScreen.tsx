'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ChatChannel,
  GamePhase,
  MAX_CHAT_MESSAGE_LENGTH,
  SKIP_VOTE,
  VotingOutcome,
  type ChatMessage,
  type GameSelfState,
  type GameSnapshot,
  type PublicPlayerState,
  type VoteTarget,
  type VotingResult,
} from '@voidline/shared';
import { Badge, Button } from '@/components/ui';
import { CharacterBust } from '@/components/character';
import { PhaseTimer } from './PhaseTimer';
import { roleIdentity } from '@/lib/fiction';
import { cn } from '@/lib/cn';

/**
 * The council (§T-§X): discussion, chat, voting, the tally and the ejection.
 *
 * One screen rather than four, because they are four beats of one event and
 * the room should not jump between layouts while people are arguing. The
 * roster stays exactly where it is throughout; what changes is what the cards
 * do - inert during discussion, selectable during voting, and carrying a
 * tally afterwards.
 *
 * SECRECY. Every card is drawn from `PublicPlayerState`, which has no role
 * field. This screen cannot mark the Cat because it was never told, and the
 * ejection reveal uses `VotingResult.ejectedRole` - which the server sends as
 * null when the room disabled confirmation. The client is never handed a
 * value it is trusted to hide (§V, §X).
 */

export interface CouncilScreenProps {
  snapshot: GameSnapshot;
  self: GameSelfState;
  chat: ChatMessage[];
  votingResult: VotingResult | null;
  onVote: (target: VoteTarget) => Promise<void>;
  onSendChat: (channel: ChatChannel, body: string) => Promise<void>;
}

export function CouncilScreen({
  snapshot,
  self,
  chat,
  votingResult,
  onVote,
  onSendChat,
}: CouncilScreenProps) {
  const meeting = snapshot.meeting;
  const [selected, setSelected] = useState<VoteTarget | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const alive = self.self.alive;
  const voting = snapshot.phase === GamePhase.VOTING;
  const ejecting = snapshot.phase === GamePhase.EJECTION;

  // A ballot already cast is final. The server would reject a second one, so
  // the interface should not offer it.
  const alreadyVoted = meeting?.votes.some((vote) => vote.voterId === self.self.id) ?? false;

  async function confirmVote() {
    if (selected === null) return;
    setSubmitting(true);
    try {
      await onVote(selected);
    } finally {
      setSubmitting(false);
    }
  }

  if (!meeting) return null;

  return (
    <main className="station-backdrop h-screen-safe flex w-full flex-col overflow-hidden px-safe">
      {/* ------------------------------------------------------- header - */}

      <header className="flex items-start justify-between gap-3 pt-safe pb-3">
        <div className="min-w-0 pt-2">
          <p className="font-mono text-[0.625rem] tracking-[0.3em] text-alert uppercase">
            {meeting.reportedPlayerName ? 'Body discovered' : 'Emergency meeting'}
          </p>
          <h1 className="mt-1 truncate font-display text-xl font-bold text-ink">
            {meeting.reportedPlayerName
              ? `${meeting.calledByName} found ${meeting.reportedPlayerName}`
              : `${meeting.calledByName} called it`}
          </h1>
        </div>
        <div className="pt-2">
          <PhaseTimer timer={snapshot.timer} />
        </div>
      </header>

      {/* ------------------------------------------------------ ejection - */}

      {ejecting && votingResult ? (
        <EjectionNotice result={votingResult} />
      ) : (
        <>
          {/* ----------------------------------------------------- roster - */}

          <section className="shrink-0 overflow-y-auto pb-3">
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {snapshot.players.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  isSelf={player.id === self.self.id}
                  votes={meeting.votes.filter((vote) => vote.target === player.id).length}
                  hasVoted={meeting.votes.some((vote) => vote.voterId === player.id)}
                  anonymous={meeting.anonymous}
                  selectable={voting && alive && !alreadyVoted && player.alive}
                  selected={selected === player.id}
                  tally={votingResult?.tallies.find((t) => t.target === player.id)?.votes ?? null}
                  onSelect={() => setSelected(player.id)}
                />
              ))}
            </ul>
          </section>

          {/* ----------------------------------------------------- voting - */}

          {voting ? (
            <div className="shrink-0 pb-3">
              {alive ? (
                alreadyVoted ? (
                  <p className="rounded-xl border border-void-700 bg-void-900 px-4 py-3 text-center text-sm text-ink-muted">
                    Your vote is in. Waiting for the rest of the crew.
                  </p>
                ) : (
                  <div className="flex gap-2">
                    {/*
                     * `shrink-0`, or the full-width Confirm beside it takes
                     * every spare pixel and the label truncates to "S…" at
                     * every width. Skip is a four-letter word; it should
                     * never be abbreviated.
                     */}
                    <Button
                      variant="secondary"
                      onClick={() => setSelected(SKIP_VOTE)}
                      className={cn(
                        'shrink-0',
                        selected === SKIP_VOTE && 'border-signal text-signal',
                      )}
                    >
                      Skip
                    </Button>
                    <Button
                      fullWidth
                      disabled={selected === null}
                      loading={submitting}
                      onClick={() => void confirmVote()}
                    >
                      {selected === null
                        ? 'Select someone'
                        : selected === SKIP_VOTE
                          ? 'Confirm skip'
                          : 'Confirm vote'}
                    </Button>
                  </div>
                )
              ) : (
                <p className="rounded-xl border border-void-700 bg-void-900 px-4 py-3 text-center text-sm text-ink-faint">
                  The dead do not vote.
                </p>
              )}
            </div>
          ) : null}

          {/* ------------------------------------------------------- chat - */}

          <Chat
            messages={chat}
            self={self}
            alive={alive}
            disabled={!alive && false}
            onSend={onSendChat}
          />
        </>
      )}
    </main>
  );
}

/* ---------------------------------------------------------- player card - */

function PlayerCard({
  player,
  isSelf,
  votes,
  hasVoted,
  anonymous,
  selectable,
  selected,
  tally,
  onSelect,
}: {
  player: PublicPlayerState;
  isSelf: boolean;
  votes: number;
  hasVoted: boolean;
  anonymous: boolean;
  selectable: boolean;
  selected: boolean;
  tally: number | null;
  onSelect: () => void;
}) {
  const content = (
    <>
      <CharacterBust
        userId={player.id}
        username={player.username}
        avatarId={player.avatar}
        appearance={player.appearance}
        expression={player.alive ? 'NORMAL' : 'DEAD'}
        className={cn('size-12', !player.alive && 'opacity-45')}
      />

      <div className="min-w-0 flex-1 text-left">
        <p
          className={cn(
            'truncate text-sm font-medium',
            player.alive ? 'text-ink' : 'text-ink-faint line-through',
          )}
        >
          {player.username}
          {isSelf ? <span className="ml-1 text-xs text-ink-faint">(you)</span> : null}
        </p>
        <p className="truncate text-[0.6875rem] text-ink-faint">
          {player.alive ? (hasVoted ? 'Voted' : 'Deciding') : 'Dead'}
        </p>
      </div>

      {/*
       * During voting with anonymity on, the server sends who voted but not
       * for whom, so this can only ever show a count of nothing. After the
       * tally it shows the real number.
       */}
      {tally !== null ? (
        <span className="shrink-0 font-mono text-sm font-bold text-ink tabular-nums">{tally}</span>
      ) : !anonymous && votes > 0 ? (
        <span className="shrink-0 font-mono text-sm text-ink-muted tabular-nums">{votes}</span>
      ) : null}
    </>
  );

  const shared =
    'flex w-full items-center gap-2 rounded-xl border p-2 transition-colors duration-150';

  return (
    <li>
      {selectable ? (
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className={cn(
            shared,
            selected
              ? 'border-signal bg-signal-glow'
              : 'border-void-700 bg-void-900 hover:border-void-500',
          )}
        >
          {content}
        </button>
      ) : (
        <div className={cn(shared, 'border-void-700 bg-void-900', !player.alive && 'opacity-70')}>
          {content}
        </div>
      )}
    </li>
  );
}

/* ------------------------------------------------------------- ejection - */

/**
 * The airlock (§X).
 *
 * The role line appears only when `ejectedRole` is non-null, and it is the
 * server that decides - it withholds the value entirely when the room has
 * confirmation turned off, rather than sending it and trusting the client not
 * to render it.
 */
function EjectionNotice({ result }: { result: VotingResult }) {
  if (result.outcome !== VotingOutcome.EJECTED) {
    return (
      <div className="animate-pop flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="font-display text-2xl font-bold text-ink">
          {result.outcome === VotingOutcome.SKIPPED
            ? 'Nobody was ejected.'
            : result.outcome === VotingOutcome.TIED
              ? 'The vote was tied.'
              : 'Not enough of the crew voted.'}
        </p>
        <p className="text-sm text-ink-muted">The airlock stays shut.</p>
      </div>
    );
  }

  const identity = result.ejectedRole ? roleIdentity(result.ejectedRole) : null;

  return (
    <div className="animate-pop flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <p className="font-display text-2xl font-bold text-ink sm:text-3xl">
        {result.ejectedName} was ejected.
      </p>

      {identity ? (
        <p
          className={cn(
            'font-display text-xl font-bold tracking-wide sm:text-2xl',
            identity.accent === 'cat' ? 'text-cat' : 'text-signal',
          )}
        >
          {result.ejectedName} was {identity.accent === 'cat' ? '' : 'not '}the Cat.
        </p>
      ) : (
        <p className="text-sm text-ink-faint">Their role stays unknown.</p>
      )}

      {result.saboteursRemaining !== null ? (
        <Badge tone={result.saboteursRemaining > 0 ? 'alert' : 'signal'}>
          {result.saboteursRemaining === 0
            ? 'Nothing is left hiding aboard'
            : `${result.saboteursRemaining} still hiding`}
        </Badge>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- chat - */

function Chat({
  messages,
  self,
  alive,
  disabled,
  onSend,
}: {
  messages: ChatMessage[];
  self: GameSelfState;
  alive: boolean;
  disabled: boolean;
  onSend: (channel: ChatChannel, body: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // The dead get their own channel, and the server never delivers a DEAD
  // message to a living socket - so this choice is a convenience, not the
  // thing keeping the channels apart.
  const channel = alive ? ChatChannel.COUNCIL : ChatChannel.DEAD;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await onSend(channel, body);
      setDraft('');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col pb-safe">
      <div className="min-h-0 flex-1 overflow-y-auto rounded-t-xl border border-b-0 border-void-700 bg-void-900/60 p-3">
        {messages.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-faint">Nobody has said anything yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {messages.map((message) => (
              <li key={message.id} className="text-sm">
                <span
                  className={cn(
                    'font-medium',
                    message.channel === ChatChannel.DEAD ? 'text-ink-faint' : 'text-signal',
                    message.senderId === self.self.id && 'text-ink',
                  )}
                >
                  {message.senderName}
                </span>
                <span className="ml-2 break-words text-ink-muted">{message.body}</span>
              </li>
            ))}
          </ul>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="flex gap-2 rounded-b-xl border border-void-700 bg-void-900 p-2"
      >
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={MAX_CHAT_MESSAGE_LENGTH}
          disabled={disabled}
          placeholder={alive ? 'Say something' : 'Dead chat'}
          aria-label="Message"
          className="min-w-0 flex-1 rounded-lg bg-void-850 px-3 py-2.5 text-sm text-ink
                     placeholder:text-ink-faint focus:outline-none"
        />
        <Button type="submit" size="sm" disabled={!draft.trim()} loading={sending}>
          Send
        </Button>
      </form>
    </section>
  );
}
