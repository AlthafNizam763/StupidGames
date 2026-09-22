import { randomUUID } from 'node:crypto';
import {
  ChatChannel,
  MAX_CHAT_MESSAGE_LENGTH,
  MeetingTrigger,
  PlayerRole,
  SKIP_VOTE,
  VotingOutcome,
  type CastVote,
  type ChatMessage,
  type MeetingState,
  type VoteTarget,
  type VotingResult,
} from '@voidline/shared';
import type { Match, MatchPlayer } from './match/types';

/**
 * Councils, chat and voting (§22, §23, §24).
 *
 * Three secrecy rules live here, and each is enforced by *what is built*, not
 * by asking a client to hide something:
 *
 * 1. A dead player's message is never delivered to a living socket. The
 *    recipient list is computed here; there is no channel a living client could
 *    subscribe to that would carry it.
 * 2. With anonymous voting on, the broadcast omits the target entirely until
 *    the tally. The client is not sent a value it is trusted to conceal.
 * 3. With `confirmEjection` off, the ejected player's role is never serialised.
 *    Not sent as null-and-hidden - not sent.
 */

export const MeetingError = {
  DEAD: 'DEAD',
  WRONG_PHASE: 'WRONG_PHASE',
  ALREADY_ACTIVE: 'ALREADY_ACTIVE',
  NO_MEETINGS_LEFT: 'NO_MEETINGS_LEFT',
} as const;
export type MeetingError = (typeof MeetingError)[keyof typeof MeetingError];

/* ------------------------------------------------------------ opening - */

export function openMeeting(
  match: Match,
  caller: MatchPlayer,
  trigger: MeetingTrigger,
  reportedPlayerId: string | null,
  now = Date.now(),
): MeetingState {
  const eligible = [...match.players.values()].filter((player) => player.alive);

  const reported = reportedPlayerId ? match.players.get(reportedPlayerId) : null;

  const meeting: MeetingState = {
    id: randomUUID(),
    trigger,
    calledById: caller.userId,
    calledByName: caller.username,
    reportedPlayerId: reported?.userId ?? null,
    reportedPlayerName: reported?.username ?? null,
    startedAt: now,
    discussionEndsAt: now + match.settings.discussionTime * 1000,
    votingEndsAt: null,
    anonymous: match.settings.anonymousVoting,
    eligibleVoterIds: eligible.map((player) => player.userId),
    votes: [],
  };

  match.meeting = meeting;

  /*
   * Everyone returns to a spawn point and every body is cleared.
   *
   * Clearing bodies matters for fairness: a body left on the floor could be
   * reported again the instant the council ends, which would let one death
   * trigger two meetings.
   */
  match.bodies = [];

  const spawns = match.map.spawns;
  let index = 0;
  for (const player of match.players.values()) {
    const spawn = spawns[index % spawns.length]!;
    player.position.x = spawn.x;
    player.position.y = spawn.y;
    player.velocity.x = 0;
    player.velocity.y = 0;
    index += 1;
  }

  if (trigger === MeetingTrigger.EMERGENCY) {
    caller.emergencyMeetingsLeft = Math.max(0, caller.emergencyMeetingsLeft - 1);
  }

  return meeting;
}

export function canCallEmergency(
  match: Match,
  player: MatchPlayer,
): { ok: true } | { ok: false; error: MeetingError } {
  if (!player.alive) return { ok: false, error: MeetingError.DEAD };
  if (match.phase !== 'PLAYING' && match.phase !== 'SABOTAGE') {
    return { ok: false, error: MeetingError.WRONG_PHASE };
  }
  if (match.meeting) return { ok: false, error: MeetingError.ALREADY_ACTIVE };
  if (player.emergencyMeetingsLeft <= 0) {
    return { ok: false, error: MeetingError.NO_MEETINGS_LEFT };
  }
  return { ok: true };
}

/* --------------------------------------------------------------- chat - */

export const ChatError = {
  NOT_ALLOWED: 'NOT_ALLOWED',
  TOO_LONG: 'TOO_LONG',
  EMPTY: 'EMPTY',
} as const;
export type ChatError = (typeof ChatError)[keyof typeof ChatError];

/**
 * A minimal profanity filter.
 *
 * Deliberately a small, obvious list rather than a pretence at completeness: a
 * real filter is a service, and claiming otherwise would be worse than the
 * honest version. What matters architecturally is that filtering happens
 * *server-side* before fan-out, so a modified client cannot opt out of it and
 * cannot see the unfiltered text.
 */
const BLOCKED = ['fuck', 'shit', 'cunt', 'bitch', 'bastard'];

export function filterMessage(body: string): { text: string; filtered: boolean } {
  let filtered = false;

  const text = body.replace(/[A-Za-z]+/g, (word) => {
    if (BLOCKED.includes(word.toLowerCase())) {
      filtered = true;
      return '*'.repeat(word.length);
    }
    return word;
  });

  return { text, filtered };
}

/**
 * Which channel a player may speak on right now.
 *
 * Returns null when they may not speak at all - which is the normal state for a
 * living player outside a council.
 */
export function channelFor(match: Match, player: MatchPlayer): ChatChannel | null {
  if (!player.alive) return ChatChannel.DEAD;
  if (match.meeting) return ChatChannel.COUNCIL;
  return null;
}

export function composeMessage(
  match: Match,
  sender: MatchPlayer,
  body: string,
): { ok: true; message: ChatMessage } | { ok: false; error: ChatError } {
  const trimmed = body.trim();
  if (trimmed.length === 0) return { ok: false, error: ChatError.EMPTY };
  if (trimmed.length > MAX_CHAT_MESSAGE_LENGTH) return { ok: false, error: ChatError.TOO_LONG };

  const channel = channelFor(match, sender);
  if (!channel) return { ok: false, error: ChatError.NOT_ALLOWED };

  const { text, filtered } = filterMessage(trimmed);

  return {
    ok: true,
    message: {
      id: randomUUID(),
      channel,
      senderId: sender.userId,
      senderName: sender.username,
      body: text,
      sentAt: Date.now(),
      filtered,
    },
  };
}

/**
 * Who may receive a message.
 *
 * This is the enforcement point for dead chat. A living player is not in the
 * recipient list for a DEAD message, so the message is never written to their
 * socket - there is nothing for a modified client to reveal.
 */
export function recipientsFor(match: Match, message: ChatMessage): MatchPlayer[] {
  const players = [...match.players.values()];

  switch (message.channel) {
    case ChatChannel.DEAD:
      return players.filter((player) => !player.alive);
    case ChatChannel.SABOTEUR:
      return players.filter((player) => player.role === PlayerRole.SABOTEUR);
    case ChatChannel.COUNCIL:
      // The living debate; the dead may watch. Watching costs the living
      // nothing, and a dead player with no window on the match has no reason
      // to stay connected - which would cost the match its body count.
      return players;
    case ChatChannel.PROXIMITY:
    default:
      return players.filter((player) => player.alive);
  }
}

/* ------------------------------------------------------------- voting - */

export const VoteError = {
  DEAD: 'DEAD',
  WRONG_PHASE: 'WRONG_PHASE',
  NO_MEETING: 'NO_MEETING',
  STALE_MEETING: 'STALE_MEETING',
  NOT_ELIGIBLE: 'NOT_ELIGIBLE',
  ALREADY_VOTED: 'ALREADY_VOTED',
  TARGET_INVALID: 'TARGET_INVALID',
  CLOSED: 'CLOSED',
} as const;
export type VoteError = (typeof VoteError)[keyof typeof VoteError];

export function openVoting(match: Match, now = Date.now()): void {
  if (!match.meeting) return;
  match.meeting.votingEndsAt = now + match.settings.votingTime * 1000;
}

export function castVote(
  match: Match,
  voter: MatchPlayer,
  meetingId: string,
  target: VoteTarget,
  now = Date.now(),
): { ok: true; vote: CastVote } | { ok: false; error: VoteError } {
  const meeting = match.meeting;
  if (!meeting) return { ok: false, error: VoteError.NO_MEETING };
  if (meeting.id !== meetingId) return { ok: false, error: VoteError.STALE_MEETING };
  if (match.phase !== 'VOTING') return { ok: false, error: VoteError.WRONG_PHASE };
  if (!voter.alive) return { ok: false, error: VoteError.DEAD };
  if (!meeting.eligibleVoterIds.includes(voter.userId)) {
    return { ok: false, error: VoteError.NOT_ELIGIBLE };
  }
  if (meeting.votingEndsAt !== null && now > meeting.votingEndsAt) {
    return { ok: false, error: VoteError.CLOSED };
  }
  if (meeting.votes.some((vote) => vote.voterId === voter.userId)) {
    return { ok: false, error: VoteError.ALREADY_VOTED };
  }

  if (target !== SKIP_VOTE) {
    const candidate = match.players.get(target);
    // Voting for a dead player, or for nobody, is not a thing the rules allow.
    if (!candidate || !candidate.alive) return { ok: false, error: VoteError.TARGET_INVALID };
  }

  meeting.votes.push({ voterId: voter.userId, target });

  if (target !== SKIP_VOTE) {
    const candidate = match.players.get(target);
    if (candidate) candidate.everVotedFor = true;
  }

  voter.councilsParticipated += 1;

  /*
   * What is broadcast, not what is stored.
   *
   * With anonymous voting on, the target is omitted from the payload entirely
   * - so other clients can show "has voted" without being sent the choice.
   */
  return {
    ok: true,
    vote: meeting.anonymous ? { voterId: voter.userId } : { voterId: voter.userId, target },
  };
}

export function everyoneVoted(match: Match): boolean {
  const meeting = match.meeting;
  if (!meeting) return false;

  const living = meeting.eligibleVoterIds.filter((id) => match.players.get(id)?.alive);
  return living.every((id) => meeting.votes.some((vote) => vote.voterId === id));
}

/**
 * Counts the ballots.
 *
 * Computed here and nowhere else. The client is sent the result, never the
 * arithmetic - a client that tallied its own votes could disagree with the
 * server about who was ejected.
 */
export function tallyVotes(match: Match): VotingResult {
  const meeting = match.meeting;
  if (!meeting) throw new Error('tallyVotes called with no meeting');

  const counts = new Map<VoteTarget, string[]>();
  for (const vote of meeting.votes) {
    const target = vote.target ?? SKIP_VOTE;
    const list = counts.get(target) ?? [];
    list.push(vote.voterId);
    counts.set(target, list);
  }

  const tallies = [...counts.entries()]
    .map(([target, voterIds]) => ({
      target,
      votes: voterIds.length,
      // Empty under anonymous voting: the tally reveals the counts, never who
      // cast them.
      voterIds: meeting.anonymous ? [] : voterIds,
    }))
    .sort((a, b) => b.votes - a.votes);

  const top = tallies[0];
  const runnerUp = tallies[1];

  let outcome: VotingOutcome;
  let ejectedId: string | null = null;

  if (!top || meeting.votes.length === 0) {
    outcome = VotingOutcome.NO_QUORUM;
  } else if (runnerUp && runnerUp.votes === top.votes) {
    // A tie ejects nobody - including a tie with SKIP.
    outcome = VotingOutcome.TIED;
  } else if (top.target === SKIP_VOTE) {
    outcome = VotingOutcome.SKIPPED;
  } else {
    outcome = VotingOutcome.EJECTED;
    ejectedId = top.target;
  }

  const ejected = ejectedId ? match.players.get(ejectedId) : null;
  const confirm = match.settings.confirmEjection;

  if (ejected) {
    ejected.alive = false;
    ejected.velocity.x = 0;
    ejected.velocity.y = 0;

    // Credit the voters who were right, for XP and the Investigator
    // achievement. Only meaningful once the ejected player's role is known
    // server-side, which it always is.
    if (ejected.role === PlayerRole.SABOTEUR) {
      for (const vote of meeting.votes) {
        if (vote.target === ejectedId) {
          const voter = match.players.get(vote.voterId);
          if (voter) voter.correctEjectionVotes += 1;
        }
      }
    } else {
      for (const vote of meeting.votes) {
        if (vote.target === ejectedId) {
          const voter = match.players.get(vote.voterId);
          if (voter) voter.votedAgainstCrew = true;
        }
      }
    }
  }

  const saboteursRemaining = [...match.players.values()].filter(
    (player) => player.alive && player.role === PlayerRole.SABOTEUR,
  ).length;

  return {
    meetingId: meeting.id,
    outcome,
    ejectedId,
    ejectedName: ejected?.username ?? null,
    /*
     * Null when the room disabled confirmation. The role is simply absent from
     * the payload - the client is not given it and asked not to look.
     */
    ejectedRole: confirm && ejected ? ejected.role : null,
    tallies,
    saboteursRemaining: confirm ? saboteursRemaining : null,
  };
}

export function closeMeeting(match: Match): void {
  match.meeting = null;
}
