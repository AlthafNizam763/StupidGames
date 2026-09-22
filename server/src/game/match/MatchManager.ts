import { randomUUID } from 'node:crypto';
import {
  AnimationState,
  ConnectionState,
  Facing,
  GamePhase,
  MeetingTrigger,
  SERVER_TICK_INTERVAL_MS,
  STATE_BROADCAST_INTERVAL_MS,
  ZoneId,
  type MapData,
} from '@voidline/shared';
import { logger } from '../../lib/logger';
import { assignRoles } from '../RoleManager';
import { primeCooldowns, resetCooldownsAfterMeeting } from '../KillManager';
import { stepPlayer } from '../MovementManager';
import { assignTasks } from '../TaskManager';
import {
  clearNonCriticalForMeeting,
  expireIfLapsed,
} from '../SabotageManager';
import {
  closeMeeting,
  everyoneVoted,
  openMeeting,
  openVoting,
  tallyVotes,
} from '../MeetingManager';
import { evaluate } from '../WinConditionManager';
import { zoneAt } from '../maps';
import type { Room } from '../RoomManager';
import type { Match, MatchEvents, MatchPlayer } from './types';

/**
 * The match engine.
 *
 * One interval per match, running the simulation and advancing the phase
 * machine. Everything it does is authoritative: clients are told the results,
 * never asked for them.
 *
 * Why an interval per match rather than one global loop over all matches: a
 * match is the unit that starts, ends and can stall. A shared loop means one
 * match's bug stops every other match on the instance, and it makes the
 * lifetime of a timer something you have to reason about globally rather than
 * per match.
 *
 * The phase machine lives here rather than in a separate class because the
 * transitions *are* the tick: nothing changes phase except the passage of time
 * or an event this loop already handles.
 */

/** How long the role reveal holds before play begins. */
const STARTING_DURATION_MS = 5_000;

/** How long the ejection result is shown before play resumes. */
const EJECTION_DURATION_MS = 5_000;

/** How long the results screen stays before the match is torn down. */
const RESULTS_DURATION_MS = 20_000;

export class MatchManager {
  private readonly matches = new Map<string, Match>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly broadcastAccumulator = new Map<string, number>();

  constructor(private readonly events: MatchEvents) {}

  /* ------------------------------------------------------------ reads - */

  get(matchId: string): Match | null {
    return this.matches.get(matchId) ?? null;
  }

  byRoom(roomId: string): Match | null {
    for (const match of this.matches.values()) {
      if (match.roomId === roomId) return match;
    }
    return null;
  }

  get size(): number {
    return this.matches.size;
  }

  /* ------------------------------------------------------------ start - */

  /**
   * Begins a match from a lobby.
   *
   * Roles are dealt here and nowhere else. Every player's private state is
   * fixed before the first snapshot goes out, so there is no window in which a
   * client could receive a partially-built match.
   */
  start(room: Room, map: MapData, now = Date.now()): Match {
    const seated = [...room.members.values()];
    const roles = assignRoles(
      seated.map((member) => member.userId),
      room.settings.saboteurCount,
    );

    const players = new Map<string, MatchPlayer>();

    seated.forEach((member, index) => {
      const spawn = map.spawns[index % map.spawns.length]!;

      players.set(member.userId, {
        userId: member.userId,
        username: member.username,
        avatar: member.avatar,
        appearance: member.appearance,
        level: member.level,
        role: roles.get(member.userId)!,
        alive: true,
        connection: member.connection,
        position: { x: spawn.x, y: spawn.y },
        velocity: { x: 0, y: 0 },
        facing: Facing.RIGHT,
        animation: AnimationState.IDLE,
        zone: zoneAt(map, spawn.x, spawn.y),
        lastInputSequence: 0,
        lastInputAt: now,
        killCooldownEndsAt: null,
        emergencyMeetingsLeft: room.settings.emergencyMeetingLimit,
        tasks: [],
        objectivesCompleted: 0,
        eliminations: 0,
        survived: false,
        councilsParticipated: 0,
        correctEjectionVotes: 0,
        everVotedFor: false,
        votedAgainstCrew: false,
      });
    });

    const match: Match = {
      id: randomUUID(),
      roomId: room.id,
      code: room.code,
      map,
      settings: room.settings,
      phase: GamePhase.STARTING,
      phaseStartedAt: now,
      phaseEndsAt: now + STARTING_DURATION_MS,
      players,
      bodies: [],
      sabotage: null,
      sabotageAvailableAt: now,
      repairedStations: new Set(),
      meeting: null,
      puzzles: new Map(),
      chat: [],
      taskTotal: 0,
      taskCompleted: 0,
      startedAt: now,
      endedAt: null,
      outcome: null,
    };

    assignTasks(match, room.settings.objectiveCount);
    primeCooldowns(match, now);

    this.matches.set(match.id, match);
    this.startTicking(match);

    logger.info(
      {
        matchId: match.id,
        roomId: room.id,
        players: players.size,
        saboteurs: [...roles.values()].filter((role) => role === 'SABOTEUR').length,
        objectives: match.taskTotal,
      },
      'match started',
    );

    return match;
  }

  /* ------------------------------------------------------------- tick - */

  private startTicking(match: Match): void {
    const timer = setInterval(() => {
      try {
        this.tick(match);
      } catch (error) {
        // A throw inside an interval would otherwise kill the timer silently
        // and freeze the match with no trace.
        logger.error({ err: error, matchId: match.id }, 'match tick failed');
      }
    }, SERVER_TICK_INTERVAL_MS);

    timer.unref();
    this.timers.set(match.id, timer);
    this.broadcastAccumulator.set(match.id, 0);
  }

  private tick(match: Match, now = Date.now()): void {
    const dt = SERVER_TICK_INTERVAL_MS / 1000;

    if (match.phase === GamePhase.PLAYING || match.phase === GamePhase.SABOTAGE) {
      for (const player of match.players.values()) {
        stepPlayer(match, player, dt);
      }

      if (expireIfLapsed(match, now)) {
        this.events.onSabotageUpdate(match);
        this.toPhase(match, GamePhase.PLAYING, null, now);
      }
    }

    this.advancePhase(match, now);

    // Win conditions are checked every tick while play is live, because a
    // critical sabotage can expire between events.
    if (!match.outcome && match.phase !== GamePhase.RESULTS && match.phase !== GamePhase.ENDED) {
      this.checkOutcome(match, now);
    }

    this.maybeBroadcast(match, now);
  }

  /**
   * Positional updates go out at `STATE_BROADCAST_HZ`, not every tick.
   *
   * The simulation runs at 20Hz; broadcasting all of it would be twice the
   * traffic for motion the client interpolates anyway.
   */
  private maybeBroadcast(match: Match, now: number): void {
    const last = this.broadcastAccumulator.get(match.id) ?? 0;
    if (now - last < STATE_BROADCAST_INTERVAL_MS) return;

    this.broadcastAccumulator.set(match.id, now);

    if (match.phase === GamePhase.PLAYING || match.phase === GamePhase.SABOTAGE) {
      this.events.onDelta(match);
    }
  }

  /* ----------------------------------------------------------- phases - */

  private advancePhase(match: Match, now: number): void {
    if (match.phaseEndsAt === null || now < match.phaseEndsAt) return;

    switch (match.phase) {
      case GamePhase.STARTING:
        this.toPhase(match, GamePhase.PLAYING, null, now);
        break;

      case GamePhase.COUNCIL:
        // Discussion is over; ballots open.
        this.toPhase(match, GamePhase.VOTING, match.settings.votingTime * 1000, now);
        openVoting(match, now);
        this.events.onMeetingOpenVoting(match);
        break;

      case GamePhase.VOTING:
        this.resolveVoting(match, now);
        break;

      case GamePhase.EJECTION:
        // The match may have been decided by the ejection itself.
        if (!this.checkOutcome(match, now)) {
          resetCooldownsAfterMeeting(match, now);
          this.toPhase(match, GamePhase.PLAYING, null, now);
        }
        break;

      case GamePhase.RESULTS:
        this.toPhase(match, GamePhase.ENDED, null, now);
        this.stop(match.id);
        break;

      default:
        break;
    }
  }

  /**
   * Moves to a new phase, refusing anything the shared state machine forbids.
   *
   * An illegal transition is a bug, and a bug that silently corrects itself is
   * a desynced match nobody can debug.
   */
  private toPhase(match: Match, phase: GamePhase, durationMs: number | null, now: number): boolean {
    if (match.phase === phase) return true;

    match.phase = phase;
    match.phaseStartedAt = now;
    match.phaseEndsAt = durationMs === null ? null : now + durationMs;

    this.events.onPhaseChange(match);
    return true;
  }

  /* --------------------------------------------------------- meetings - */

  /** Opens a council, from a body report or an emergency. */
  beginMeeting(
    match: Match,
    caller: MatchPlayer,
    trigger: MeetingTrigger,
    reportedPlayerId: string | null,
    now = Date.now(),
  ): void {
    // Non-critical sabotage clears; a critical countdown deliberately does not.
    clearNonCriticalForMeeting(match);

    openMeeting(match, caller, trigger, reportedPlayerId, now);
    this.toPhase(match, GamePhase.COUNCIL, match.settings.discussionTime * 1000, now);
  }

  /** Called when every eligible voter has voted, to end voting early. */
  maybeResolveVotingEarly(match: Match, now = Date.now()): void {
    if (match.phase !== GamePhase.VOTING) return;
    if (!everyoneVoted(match)) return;
    this.resolveVoting(match, now);
  }

  private resolveVoting(match: Match, now: number): void {
    if (!match.meeting) return;

    const result = tallyVotes(match);
    closeMeeting(match);

    /*
     * Stored BEFORE the event fires.
     *
     * `onMeetingResolved` is what broadcasts the tally, and it reads it from
     * here. Setting it afterwards meant the broadcast found nothing and every
     * client learned the outcome only by inference from the next snapshot -
     * the ejection screen had no result to show.
     */
    lastVotingResults.set(match.id, result);

    this.toPhase(match, GamePhase.EJECTION, EJECTION_DURATION_MS, now);
    this.events.onMeetingResolved(match);
  }

  /* ---------------------------------------------------------- outcome - */

  /** Evaluates win conditions and ends the match if one is met. Returns true if it did. */
  checkOutcome(match: Match, now = Date.now()): boolean {
    const outcome = evaluate(match, now);
    if (!outcome) return false;

    match.outcome = { winner: outcome.winner, reason: outcome.reason };
    match.endedAt = now;

    for (const player of match.players.values()) {
      player.survived = player.alive;
    }

    this.toPhase(match, GamePhase.RESULTS, RESULTS_DURATION_MS, now);

    logger.info(
      { matchId: match.id, winner: outcome.winner, reason: outcome.reason },
      'match ended',
    );

    this.events.onMatchEnded(match);
    return true;
  }

  /* ------------------------------------------------------------- stop - */

  stop(matchId: string): void {
    const timer = this.timers.get(matchId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(matchId);
    }
    this.broadcastAccumulator.delete(matchId);
  }

  /** Removes a finished match from memory. */
  destroy(matchId: string): void {
    this.stop(matchId);
    this.matches.delete(matchId);
    lastVotingResults.delete(matchId);
  }

  /** Stops every match. Used by graceful shutdown and tests. */
  stopAll(): void {
    for (const matchId of [...this.timers.keys()]) this.stop(matchId);
    this.matches.clear();
    lastVotingResults.clear();
  }

  /* ------------------------------------------------------ connections - */

  setConnection(match: Match, userId: string, connection: ConnectionState): void {
    const player = match.players.get(userId);
    if (!player) return;

    player.connection = connection;

    if (connection !== ConnectionState.CONNECTED) {
      // A dropped player stops moving. Leaving their velocity set would send
      // them walking into a wall for the length of the grace period.
      player.velocity.x = 0;
      player.velocity.y = 0;
    }

    /*
     * Push a snapshot.
     *
     * `game:state` is otherwise only sent on a phase change, so without this a
     * connection change would not reach anyone until the next council - leaving
     * the authoritative snapshot saying CONNECTED about a player the clients
     * were separately told had dropped, for minutes at a time.
     *
     * Safe to send eagerly because connection changes are rare: this fires on
     * churn, not on the tick.
     */
    this.events.onSnapshot(match);

    // A side losing its last connected member can decide the match.
    this.checkOutcome(match);
  }

  /** The zone a player is in, for HUD and reporting. */
  refreshZone(match: Match, player: MatchPlayer): ZoneId {
    player.zone = zoneAt(match.map, player.position.x, player.position.y);
    return player.zone;
  }
}

/**
 * The most recent voting result per match.
 *
 * Kept beside the manager rather than on the match because it is a *message*,
 * not state: it is produced once, sent once, and has no meaning afterwards.
 * Putting it on `Match` would mean every snapshot carried a stale tally.
 */
export const lastVotingResults = new Map<
  string,
  ReturnType<typeof tallyVotes>
>();
