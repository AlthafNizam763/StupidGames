import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import {
  ConnectionState,
  DEFAULT_APPEARANCE,
  DEFAULT_ROOM_SETTINGS,
  GamePhase,
  PlayerRole,
  VoiceChannel,
  VoiceProviderName,
} from '@voidline/shared';
import { ORBITAL_09 } from '../game/maps';
import type { Match, MatchPlayer } from '../game/match/types';
import { canHear, grantFor, roomNameFor } from './permissions';
import { DisabledProvider, LiveKitProvider, UnimplementedProvider } from './providers';

/**
 * Voice permissions.
 *
 * The important test here is not any single case but the *exhaustive* one: for
 * every phase, and every combination of alive and dead, no living player may
 * ever share a room with a dead one. A rule checked case by case can be broken
 * by a phase added later; a rule checked across the whole matrix cannot.
 */

function makePlayer(id: string, role: PlayerRole, alive = true): MatchPlayer {
  return {
    userId: id,
    username: id,
    avatar: 'operator-01',
    appearance: DEFAULT_APPEARANCE,
    level: 1,
    role,
    alive,
    connection: ConnectionState.CONNECTED,
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    facing: 'RIGHT',
    animation: 'IDLE',
    zone: 'CORRIDOR',
    lastInputSequence: 0,
    lastBroadcast: null,
    lastInputAt: 0,
    killCooldownEndsAt: null,
    emergencyMeetingsLeft: 1,
    tasks: [],
    objectivesCompleted: 0,
    eliminations: 0,
    survived: false,
    councilsParticipated: 0,
    correctEjectionVotes: 0,
    everVotedFor: false,
    votedAgainstCrew: false,
  };
}

function makeMatch(phase: GamePhase): Match {
  const players = new Map<string, MatchPlayer>();
  players.set('op-alive', makePlayer('op-alive', PlayerRole.OPERATOR, true));
  players.set('op-dead', makePlayer('op-dead', PlayerRole.OPERATOR, false));
  players.set('sab-alive', makePlayer('sab-alive', PlayerRole.SABOTEUR, true));
  players.set('sab-dead', makePlayer('sab-dead', PlayerRole.SABOTEUR, false));

  return {
    id: 'match-voice',
    roomId: 'room-1',
    code: 'ABC123',
    map: ORBITAL_09,
    settings: { ...DEFAULT_ROOM_SETTINGS, name: 'Voice', map: 'ORBITAL_09', isPrivate: true },
    phase,
    phaseStartedAt: 0,
    phaseEndsAt: null,
    players,
    bodies: [],
    sabotage: null,
    sabotageAvailableAt: 0,
    repairedStations: new Set(),
    meeting: null,
    puzzles: new Map(),
    chat: [],
    taskTotal: 0,
    taskCompleted: 0,
    startedAt: 0,
    endedAt: null,
    outcome: null,
  };
}

const ALL_PHASES = Object.values(GamePhase);
/** Phases in which roles exist and therefore something is worth hiding. */
const LIVE_PHASES = [
  GamePhase.STARTING,
  GamePhase.PLAYING,
  GamePhase.SABOTAGE,
  GamePhase.COUNCIL,
  GamePhase.VOTING,
  GamePhase.EJECTION,
];

describe('voice permissions', () => {
  it('puts living players on proximity during free roam', () => {
    const match = makeMatch(GamePhase.PLAYING);
    const grant = grantFor(match, match.players.get('op-alive')!);

    assert.equal(grant?.channel, VoiceChannel.PROXIMITY);
    assert.equal(grant?.publish, true);
    assert.equal(grant?.subscribe, true);
  });

  it('puts living players on the council channel during a meeting', () => {
    for (const phase of [GamePhase.COUNCIL, GamePhase.VOTING, GamePhase.EJECTION]) {
      const match = makeMatch(phase);
      assert.equal(
        grantFor(match, match.players.get('op-alive')!)?.channel,
        VoiceChannel.COUNCIL,
        `wrong channel in ${phase}`,
      );
    }
  });

  it('puts dead players on the dead channel in every live phase', () => {
    for (const phase of LIVE_PHASES) {
      const match = makeMatch(phase);
      assert.equal(
        grantFor(match, match.players.get('op-dead')!)?.channel,
        VoiceChannel.DEAD,
        `a dead player escaped the dead channel in ${phase}`,
      );
    }
  });

  it('silences everyone during the role reveal', () => {
    const match = makeMatch(GamePhase.STARTING);
    // A player reacting out loud to their own role is a tell, and it is the
    // one moment the game can prevent it.
    assert.equal(grantFor(match, match.players.get('op-alive')!), null);
    assert.equal(grantFor(match, match.players.get('sab-alive')!), null);
  });

  it('opens the lobby channel to everybody before roles exist', () => {
    const match = makeMatch(GamePhase.LOBBY);
    assert.equal(grantFor(match, match.players.get('op-alive')!)?.channel, VoiceChannel.LOBBY);
  });

  it('opens a results channel once roles are public', () => {
    const match = makeMatch(GamePhase.RESULTS);
    assert.equal(grantFor(match, match.players.get('op-alive')!)?.channel, VoiceChannel.RESULTS);
  });

  it('grants nothing once the match has ended', () => {
    const match = makeMatch(GamePhase.ENDED);
    assert.equal(grantFor(match, match.players.get('op-alive')!), null);
  });

  it('gives a Saboteur exactly the same channel as an Operator', () => {
    for (const phase of LIVE_PHASES) {
      const match = makeMatch(phase);
      const operator = grantFor(match, match.players.get('op-alive')!);
      const saboteur = grantFor(match, match.players.get('sab-alive')!);

      /*
       * There is deliberately no Saboteur voice channel. A player who is
       * visibly talking when nobody else hears anything has told the room what
       * they are - a private channel for one team is the easiest possible way
       * to leak a role.
       */
      assert.deepEqual(saboteur, operator, `roles diverged in ${phase}`);
    }
  });

  describe('the living and the dead never share a room', () => {
    it('holds across every phase and every pairing', () => {
      for (const phase of ALL_PHASES) {
        const match = makeMatch(phase);

        for (const listener of match.players.values()) {
          for (const speaker of match.players.values()) {
            if (listener.alive === speaker.alive) continue;

            assert.equal(
              canHear(match, listener, speaker),
              false,
              `${listener.userId} (alive=${listener.alive}) could hear ` +
                `${speaker.userId} (alive=${speaker.alive}) in ${phase}`,
            );
          }
        }
      }
    });

    it('still lets the living hear each other', () => {
      const match = makeMatch(GamePhase.PLAYING);
      assert.equal(
        canHear(match, match.players.get('op-alive')!, match.players.get('sab-alive')!),
        true,
      );
    });

    it('still lets the dead hear each other', () => {
      const match = makeMatch(GamePhase.PLAYING);
      assert.equal(
        canHear(match, match.players.get('op-dead')!, match.players.get('sab-dead')!),
        true,
      );
    });
  });

  it('never reuses a room name between matches', () => {
    // Two matches sharing a room would put strangers in each other's councils.
    assert.notEqual(
      roomNameFor('match-a', VoiceChannel.COUNCIL),
      roomNameFor('match-b', VoiceChannel.COUNCIL),
    );
  });
});

describe('voice providers', () => {
  it('reports itself unavailable when nothing is configured', () => {
    const provider = new DisabledProvider();
    assert.equal(provider.capability.enabled, false);
    // Not a stub that pretends: asked for a token, it refuses.
    assert.throws(() => provider.issue());
  });

  it('reports a configured but unimplemented provider honestly', () => {
    const provider = new UnimplementedProvider(VoiceProviderName.AGORA);
    assert.equal(provider.capability.enabled, false);
    assert.match(provider.capability.reason ?? '', /not implemented/i);
    assert.throws(() => provider.issue());
  });

  describe('livekit', () => {
    const secret = 'a'.repeat(48);
    const provider = new LiveKitProvider('api-key', secret, 'wss://voice.example');

    function decode(token: string) {
      return jwt.verify(token, secret) as Record<string, unknown> & {
        video: Record<string, unknown>;
      };
    }

    it('mints a token scoped to exactly the granted room', () => {
      const grant = {
        channel: VoiceChannel.COUNCIL,
        room: roomNameFor('match-1', VoiceChannel.COUNCIL),
        publish: true,
        subscribe: true,
      };

      const issued = provider.issue('player-1', 'Vega', grant);
      const claims = decode(issued.token);

      assert.equal(claims.video.room, grant.room);
      assert.equal(claims.video.roomJoin, true);
      assert.equal(claims.sub, 'player-1');
    });

    it('carries the publish and subscribe permissions through', () => {
      const grant = {
        channel: VoiceChannel.DEAD,
        room: roomNameFor('match-1', VoiceChannel.DEAD),
        publish: false,
        subscribe: true,
      };

      const claims = decode(provider.issue('ghost', 'Ghost', grant).token);
      assert.equal(claims.video.canPublish, false);
      assert.equal(claims.video.canSubscribe, true);
    });

    it('never lets a client create a room', () => {
      const claims = decode(
        provider.issue('player-1', 'Vega', {
          channel: VoiceChannel.PROXIMITY,
          room: roomNameFor('match-1', VoiceChannel.PROXIMITY),
          publish: true,
          subscribe: true,
        }).token,
      );

      // A client that could create a room could create one nobody authorised.
      assert.equal(claims.video.roomCreate, undefined);
    });

    it('never opens a data channel', () => {
      const claims = decode(
        provider.issue('player-1', 'Vega', {
          channel: VoiceChannel.PROXIMITY,
          room: roomNameFor('match-1', VoiceChannel.PROXIMITY),
          publish: true,
          subscribe: true,
        }).token,
      );

      // A second, unvalidated channel between clients would route around every
      // rule the server enforces.
      assert.equal(claims.video.canPublishData, false);
    });

    it('expires', () => {
      const issued = provider.issue('player-1', 'Vega', {
        channel: VoiceChannel.LOBBY,
        room: roomNameFor('match-1', VoiceChannel.LOBBY),
        publish: true,
        subscribe: true,
      });

      const claims = decode(issued.token);
      assert.ok(typeof claims.exp === 'number');
      assert.ok(issued.expiresIn > 0);
    });

    it('is signed, so a client cannot forge one', () => {
      const issued = provider.issue('player-1', 'Vega', {
        channel: VoiceChannel.COUNCIL,
        room: roomNameFor('match-1', VoiceChannel.COUNCIL),
        publish: true,
        subscribe: true,
      });

      // The whole reason tokens are minted server-side: a client that could
      // sign its own would choose its own room.
      assert.throws(() => jwt.verify(issued.token, 'b'.repeat(48)));
    });
  });
});
