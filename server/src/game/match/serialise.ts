import {
  AnimationState,
  ConnectionState,
  PlayerRole,
  type GameSelfState,
  type GameSnapshot,
  type MovementDelta,
  type PhaseTimer,
  type PublicPlayerState,
  type SelfPlayerState,
} from '@voidline/shared';
import { commsDown } from '../SabotageManager';
import { teamProgress } from '../TaskManager';
import type { Match, MatchPlayer } from './types';

/**
 * Wire serialisation.
 *
 * This file is the secrecy boundary. Every rule in SECURITY.md about what a
 * player may not learn is enforced here, by building a payload that does not
 * contain it - not by flagging it, not by asking a client to skip it.
 *
 * If you are adding a field, the question is not "should the client hide this?"
 * but "is there any player this must not reach?". If there is, it does not
 * belong in `toPublicPlayer`.
 */

/**
 * One player, as everyone sees them.
 *
 * Note what is absent: no role, no task list, no cooldown, no ally list. Those
 * exist only on `SelfPlayerState`, which goes to one socket.
 */
function toPublicPlayer(match: Match, player: MatchPlayer): PublicPlayerState {
  const state: PublicPlayerState = {
    id: player.userId,
    username: player.username,
    avatar: player.avatar,
    // Public by design: every client must draw every player identically, or
    // the Saboteur is the one nobody can render.
    appearance: player.appearance,
    position: { x: player.position.x, y: player.position.y },
    facing: player.facing,
    animation: player.alive ? player.animation : AnimationState.DEAD,
    alive: player.alive,
    connection: player.connection,
  };

  /*
   * Zone is omitted entirely while comms are down.
   *
   * Sending it with a "hidden" flag would mean every client held the location
   * of every player during the one sabotage whose entire purpose is to take
   * that away.
   */
  if (!commsDown(match)) state.zone = player.zone;

  return state;
}

export function toPhaseTimer(match: Match): PhaseTimer {
  return {
    phase: match.phase,
    startedAt: match.phaseStartedAt,
    endsAt: match.phaseEndsAt,
  };
}

/** The public world, broadcast to everyone in the match. */
export function toSnapshot(match: Match): GameSnapshot {
  return {
    matchId: match.id,
    map: match.map.id,
    phase: match.phase,
    timer: toPhaseTimer(match),
    players: [...match.players.values()].map((player) => toPublicPlayer(match, player)),
    /*
     * Bodies are withheld during a meeting. They are cleared from state when a
     * council opens, but sending an empty list explicitly is the point: a
     * client should not be able to infer from a missing field that something
     * was there.
     */
    bodies: match.meeting ? [] : match.bodies.map((body) => ({ ...body })),
    tasks: teamProgress(match),
    sabotage: match.sabotage ? { ...match.sabotage } : null,
    meeting: match.meeting ? { ...match.meeting, votes: [...match.meeting.votes] } : null,
    serverTime: Date.now(),
  };
}

/**
 * The high-frequency positional update.
 *
 * Carries only what changes every tick. A full snapshot ten times a second
 * would send every player's name, avatar and appearance along with their
 * position - hundreds of bytes per player per message for data that has not
 * changed since the match began.
 */
/**
 * Wire precision for positions, in world units.
 *
 * Whole units. A player is 18 units across and the camera never zooms past
 * roughly 1.5x, so half a unit is well under a pixel - and the client
 * interpolates between deltas anyway, so it is smoothing across far more than
 * the rounding error. The server keeps full precision internally; only the
 * broadcast is quantised.
 *
 * This is worth more than the bytes it saves directly. `640.4372119903564`
 * costs 18 characters and is different every single tick, so it defeats
 * compression as well; `640` costs three and repeats.
 */
function quantise(value: number): number {
  return Math.round(value);
}

/**
 * The high-frequency movement broadcast.
 *
 * Carries only players whose quantised state changed since the last one. A
 * twelve-player match spends most of its time with two thirds of the lobby
 * standing at a terminal or reading chat, and re-sending an identical position
 * ten times a second for each of them was the single largest use of bandwidth
 * in the game (§40).
 *
 * `keyframe` forces every player in. The suppression is only safe because the
 * client is guaranteed to learn about a player it has not heard from some other
 * way; a periodic keyframe is what provides that guarantee, so that a client
 * which somehow missed an update repairs itself within a second rather than
 * holding a stale position for the rest of the match.
 */
export function toDelta(match: Match, keyframe = false): MovementDelta {
  const players: MovementDelta['players'] = [];

  for (const player of match.players.values()) {
    const x = quantise(player.position.x);
    const y = quantise(player.position.y);
    const facing = player.facing;
    // The dead read as DEAD on the wire whatever their animation says, so the
    // comparison has to be against the value that is actually sent.
    const animation = player.alive ? player.animation : AnimationState.DEAD;

    const last = player.lastBroadcast;
    const unchanged =
      last !== null &&
      last.x === x &&
      last.y === y &&
      last.facing === facing &&
      last.animation === animation;

    if (unchanged && !keyframe) continue;

    player.lastBroadcast = { x, y, facing, animation };
    players.push({ id: player.userId, position: { x, y }, facing, animation });
  }

  return { players, serverTime: Date.now() };
}

/**
 * The private slice, for one player's socket only.
 *
 * `allyIds` is the one place a player learns something about somebody else's
 * role, and it is populated only for Saboteurs. An Operator's list is always
 * empty - not filtered to empty on the client, built empty here.
 */
export function toSelfState(match: Match, player: MatchPlayer): GameSelfState {
  const allies =
    player.role === PlayerRole.SABOTEUR
      ? [...match.players.values()]
          .filter((other) => other.role === PlayerRole.SABOTEUR && other.userId !== player.userId)
          .map((other) => other.userId)
      : [];

  const self: SelfPlayerState = {
    ...toPublicPlayer(match, player),
    role: player.role,
    taskIds: player.tasks.map((task) => task.id),
    killCooldownEndsAt: player.killCooldownEndsAt,
    sabotageCooldownEndsAt:
      player.role === PlayerRole.SABOTEUR ? match.sabotageAvailableAt : null,
    emergencyMeetingsLeft: player.emergencyMeetingsLeft,
    allyIds: allies,
    // A player always knows their own zone, comms sabotage or not - they can
    // see the room they are standing in.
    zone: player.zone,
  };

  return {
    self,
    tasks: player.tasks.map((task) => ({ ...task })),
  };
}

/** Living players, for fan-out decisions. */
export function livingPlayers(match: Match): MatchPlayer[] {
  return [...match.players.values()].filter((player) => player.alive);
}

export function connectedPlayers(match: Match): MatchPlayer[] {
  return [...match.players.values()].filter(
    (player) => player.connection === ConnectionState.CONNECTED,
  );
}
