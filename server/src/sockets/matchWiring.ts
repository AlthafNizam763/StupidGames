import {
  GamePhase,
  SERVER_EVENT,
  type Namespace,
} from './namespaceTypes';
import { MatchManager, lastVotingResults } from '../game/match/MatchManager';
import { toDelta, toPhaseTimer, toSelfState, toSnapshot } from '../game/match/serialise';
import { finaliseMatch } from '../services/matchResultService';
import { logger } from '../lib/logger';
import { roomManager } from '../game/RoomManager';
import type { Match } from '../game/match/types';

/**
 * Connects the match engine to the socket namespace.
 *
 * The engine knows nothing about sockets - it calls the `MatchEvents` callbacks
 * and this file decides who hears what. That separation is what lets every rule
 * in `game/` be tested without opening a connection.
 *
 * The fan-out rules live here, and they are the second half of the secrecy
 * story: `serialise.ts` decides what a payload contains, this decides who
 * receives it.
 */

export function createMatchManager(namespace: Namespace): MatchManager {
  const channel = (roomId: string) => `room:${roomId}`;

  /** Sends each player their own private slice. One payload per socket. */
  function sendSelfStates(match: Match): void {
    for (const [, socket] of namespace.sockets) {
      const player = match.players.get(socket.data.userId);
      if (player && socket.data.roomId === match.roomId) {
        socket.emit(SERVER_EVENT.GAME_SELF, toSelfState(match, player));
      }
    }
  }

  const manager: MatchManager = new MatchManager({
    onSnapshot(match) {
      namespace.to(channel(match.roomId)).emit(SERVER_EVENT.GAME_STATE, toSnapshot(match));
    },

    onDelta(match, keyframe) {
      const delta = toDelta(match, keyframe);

      // Nobody moved. Sending an empty player list is pure framing overhead,
      // ten times a second, to every client in the room - and during a council
      // or a task screen that is most of them, most of the time.
      if (delta.players.length === 0) return;

      namespace.to(channel(match.roomId)).emit(SERVER_EVENT.GAME_DELTA, delta);
    },

    onSabotageUpdate(match) {
      namespace.to(channel(match.roomId)).emit(SERVER_EVENT.GAME_STATE, toSnapshot(match));
    },

    onMeetingOpenVoting(match) {
      if (!match.meeting) return;
      namespace.to(channel(match.roomId)).emit(SERVER_EVENT.COUNCIL_VOTING_OPEN, {
        meetingId: match.meeting.id,
        endsAt: match.meeting.votingEndsAt ?? 0,
      });
      namespace.to(channel(match.roomId)).emit(SERVER_EVENT.GAME_STATE, toSnapshot(match));
    },

    onMeetingResolved(match) {
      const result = lastVotingResults.get(match.id);
      if (result) {
        /*
         * Already redacted by `tallyVotes`: with confirmation off, the role is
         * absent from this payload rather than present and hidden, and with
         * anonymous voting on the tallies carry no voter ids.
         */
        namespace.to(channel(match.roomId)).emit(SERVER_EVENT.COUNCIL_RESULT, result);
      }

      // An ejection changes who is alive, so private state changes too.
      sendSelfStates(match);
      namespace.to(channel(match.roomId)).emit(SERVER_EVENT.GAME_STATE, toSnapshot(match));
    },

    onPhaseChange(match) {
      namespace.to(channel(match.roomId)).emit(SERVER_EVENT.GAME_TIMER, toPhaseTimer(match));
      namespace.to(channel(match.roomId)).emit(SERVER_EVENT.GAME_STATE, toSnapshot(match));

      // Keep the room's own phase in step, so the lobby and the REST preview
      // agree with the match about whether it is joinable.
      const room = roomManager.getById(match.roomId);
      if (room && room.phase !== match.phase) {
        room.phase = match.phase;
      }
    },

    onMatchEnded(match) {
      /*
       * Persistence and XP happen off the tick.
       *
       * `finaliseMatch` writes to MongoDB for every player; awaiting it inside
       * the interval would block the loop for every other match on this
       * instance. The result is broadcast when it lands.
       */
      void finaliseMatch(match)
        .then((result) => {
          namespace.to(channel(match.roomId)).emit(SERVER_EVENT.GAME_RESULT, result);
        })
        .catch((error: unknown) => {
          logger.error({ err: error, matchId: match.id }, 'failed to finalise match');
        })
        .finally(() => {
          // Returned to the lobby so the group can play again without
          // recreating the room and re-sharing the code.
          const room = roomManager.getById(match.roomId);
          if (room) {
            room.phase = GamePhase.LOBBY;
            for (const member of room.members.values()) {
              member.isReady = member.isHost;
            }
          }
        });
    },
  });

  return manager;
}
