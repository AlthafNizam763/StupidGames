import {
  AnimationState,
  ChatChannel,
  ConnectionState,
  Facing,
  GamePhase,
  MapId,
  MeetingTrigger,
  PlayerRole,
  Team,
  VotingOutcome,
  WinReason,
  ZoneId,
  deriveAppearance,
  type ChatMessage,
  type GameSelfState,
  type GameSnapshot,
  type MatchResult,
  type PublicPlayerState,
  type VotingResult,
} from '@voidline/shared';

/**
 * Sample payloads for the development preview harness.
 *
 * DEVELOPMENT ONLY. Nothing here is imported by anything under
 * `components/`, and every page that uses it answers 404 in production.
 *
 * These exist because the council, the HUD and the results screen cannot be
 * reached without a running server, a database and seven other people. The
 * alternative to sample payloads is shipping three of the game's most
 * important screens having never looked at them - which is the exact failure
 * this project already made once.
 *
 * They are built from the real shared types, deliberately. If the server
 * changes a payload, this file stops compiling, which is the point: a preview
 * that silently drifts from the contract is worse than no preview.
 */

const CREW = [
  { id: 'p-maya', name: 'Maya', avatar: 'operator-03' },
  { id: 'p-alex', name: 'Alex', avatar: 'operator-01' },
  { id: 'p-sam', name: 'Sam', avatar: 'operator-05' },
  { id: 'p-imani', name: 'Imani', avatar: 'operator-06' },
  { id: 'p-tobias', name: 'Tobias', avatar: 'operator-04' },
  { id: 'p-yuki', name: 'Yuki', avatar: 'operator-02' },
] as const;

export const VIEWER_ID = 'p-maya';

function player(
  index: number,
  overrides: Partial<PublicPlayerState> = {},
): PublicPlayerState {
  const member = CREW[index]!;
  return {
    id: member.id,
    username: member.name,
    avatar: member.avatar,
    appearance: deriveAppearance(member.id),
    position: { x: 400 + index * 90, y: 600 },
    facing: Facing.RIGHT,
    animation: AnimationState.IDLE,
    alive: true,
    connection: ConnectionState.CONNECTED,
    zone: ZoneId.MEDICAL_BAY,
    ...overrides,
  };
}

/* ------------------------------------------------------------ snapshot - */

export function sampleSnapshot(phase: GamePhase): GameSnapshot {
  const players = [
    player(0),
    player(1),
    player(2, { alive: false, animation: AnimationState.DEAD }),
    player(3),
    player(4),
    player(5, { connection: ConnectionState.RECONNECTING }),
  ];

  const inCouncil =
    phase === GamePhase.COUNCIL || phase === GamePhase.VOTING || phase === GamePhase.EJECTION;

  return {
    matchId: 'preview-match',
    map: MapId.ORBITAL_09,
    phase,
    timer: {
      phase,
      startedAt: 0,
      // A fixed offset from zero rather than from `Date.now()`, so this module
      // stays pure; the harness adds the current time when it mounts.
      endsAt: null,
    },
    players,
    bodies: [
      {
        id: 'body-1',
        playerId: 'p-sam',
        position: { x: 580, y: 600 },
        zone: ZoneId.MEDICAL_BAY,
        reported: inCouncil,
      },
    ],
    tasks: { completed: 11, total: 28, ratio: 11 / 28 },
    sabotage: null,
    meeting: inCouncil
      ? {
          id: 'meeting-1',
          trigger: MeetingTrigger.BODY_REPORT,
          calledById: 'p-alex',
          calledByName: 'Alex',
          reportedPlayerId: 'p-sam',
          reportedPlayerName: 'Sam',
          startedAt: 0,
          discussionEndsAt: 0,
          votingEndsAt: null,
          anonymous: false,
          eligibleVoterIds: players.filter((p) => p.alive).map((p) => p.id),
          votes:
            phase === GamePhase.VOTING
              ? [
                  { voterId: 'p-alex', target: 'p-tobias' },
                  { voterId: 'p-imani', target: 'p-tobias' },
                ]
              : [],
        }
      : null,
    serverTime: 0,
  };
}

/* ---------------------------------------------------------------- self - */

export function sampleSelf(role: PlayerRole): GameSelfState {
  return {
    self: {
      ...player(0),
      role,
      taskIds: ['t1', 't2', 't3'],
      // Offsets from zero; the harness rebases these onto the real clock.
      killCooldownEndsAt: role === PlayerRole.SABOTEUR ? 0 : null,
      sabotageCooldownEndsAt: role === PlayerRole.SABOTEUR ? 0 : null,
      emergencyMeetingsLeft: 1,
      allyIds: role === PlayerRole.SABOTEUR ? ['p-yuki'] : [],
    },
    tasks: [
      {
        id: 't1',
        type: 'REACTOR_CALIBRATION',
        zone: ZoneId.REACTOR_CORE,
        terminalId: 'term-1',
        duration: 12,
        steps: 2,
        progress: 2,
        status: 'COMPLETE',
      },
      {
        id: 't2',
        type: 'SIGNAL_ROUTING',
        zone: ZoneId.COMMUNICATIONS,
        terminalId: 'term-2',
        duration: 10,
        steps: 1,
        progress: 0,
        status: 'PENDING',
      },
      {
        id: 't3',
        type: 'OXYGEN_BALANCING',
        zone: ZoneId.HYDROPONICS,
        terminalId: 'term-3',
        duration: 14,
        steps: 2,
        progress: 1,
        status: 'IN_PROGRESS',
      },
    ],
  };
}

/* ---------------------------------------------------------------- chat - */

export const SAMPLE_CHAT: ChatMessage[] = [
  {
    id: 'c1',
    channel: ChatChannel.COUNCIL,
    senderId: 'p-alex',
    senderName: 'Alex',
    body: 'Sam was in Medical. I walked in and they were already down.',
    sentAt: 0,
    filtered: false,
  },
  {
    id: 'c2',
    channel: ChatChannel.COUNCIL,
    senderId: 'p-tobias',
    senderName: 'Tobias',
    body: 'I was in Reactor the whole time, Imani can vouch.',
    sentAt: 0,
    filtered: false,
  },
  {
    id: 'c3',
    channel: ChatChannel.COUNCIL,
    senderId: 'p-imani',
    senderName: 'Imani',
    body: 'I can not. You left before I finished the second dial.',
    sentAt: 0,
    filtered: false,
  },
  {
    id: 'c4',
    channel: ChatChannel.COUNCIL,
    senderId: 'p-maya',
    senderName: 'Maya',
    body: 'Where was Yuki?',
    sentAt: 0,
    filtered: false,
  },
];

/* ------------------------------------------------------------- outcomes - */

export const SAMPLE_VOTING_RESULT: VotingResult = {
  meetingId: 'meeting-1',
  outcome: VotingOutcome.EJECTED,
  ejectedId: 'p-tobias',
  ejectedName: 'Tobias',
  // Non-null, so the preview shows the reveal variant. The server sends null
  // when the room has confirmation disabled.
  ejectedRole: PlayerRole.OPERATOR,
  tallies: [
    { target: 'p-tobias', votes: 3, voterIds: ['p-alex', 'p-imani', 'p-maya'] },
    { target: 'p-yuki', votes: 1, voterIds: ['p-tobias'] },
  ],
  saboteursRemaining: null,
};

export function sampleResult(winner: Team): MatchResult {
  const catId = 'p-yuki';

  return {
    matchId: 'preview-match',
    winner,
    reason:
      winner === Team.OPERATORS ? WinReason.SABOTEURS_ELIMINATED : WinReason.SABOTEURS_REACHED_PARITY,
    duration: 512,
    endedAt: '2026-09-22T17:40:00.000Z',
    players: CREW.map((member, index) => {
      const isCat = member.id === catId;
      const won = (winner === Team.SABOTEURS) === isCat;

      return {
        userId: member.id,
        username: member.name,
        avatar: member.avatar,
        role: isCat ? PlayerRole.SABOTEUR : PlayerRole.OPERATOR,
        survived: index % 3 !== 2,
        objectivesCompleted: isCat ? 0 : 4 + index,
        eliminations: isCat ? 3 : 0,
        xpEarned: won ? 250 : 90,
        xpBreakdown: won
          ? [
              { label: 'Match completed', amount: 50 },
              { label: 'Objectives', amount: 80 },
              { label: 'Victory', amount: 120 },
            ]
          : [
              { label: 'Match completed', amount: 50 },
              { label: 'Objectives', amount: 40 },
            ],
        unlocked: index === 0 && won ? ['FIRST_VICTORY'] : [],
        levelBefore: 5,
        levelAfter: index === 0 && won ? 6 : 5,
      };
    }),
  };
}
