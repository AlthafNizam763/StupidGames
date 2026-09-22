import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  ConnectionState,
  DEFAULT_APPEARANCE,
  DEFAULT_ROOM_SETTINGS,
  GamePhase,
  MeetingTrigger,
  PlayerRole,
  SKIP_VOTE,
  Team,
  TaskStatus,
  WinReason,
  type RoomSettings,
} from '@voidline/shared';
import { eliminate, primeCooldowns, reportBody } from '../KillManager';
import { applyInput, stepPlayer } from '../MovementManager';
import {
  castVote,
  composeMessage,
  openMeeting,
  openVoting,
  recipientsFor,
  tallyVotes,
} from '../MeetingManager';
import { assignRoles, secureShuffle } from '../RoleManager';
import { repair, startSabotage } from '../SabotageManager';
import { assignTasks, generatePuzzle, openTask, submitStep, teamProgress } from '../TaskManager';
import type { PuzzlePrompt } from '@voidline/shared';
import { evaluate } from '../WinConditionManager';
import { ORBITAL_09 } from '../maps';
import { toDelta, toSelfState, toSnapshot } from './serialise';
import { MatchManager } from './MatchManager';
import type { Match, MatchPlayer } from './types';

/**
 * The game rules, end to end.
 *
 * These run against the real managers and the real ORBITAL-09 geometry, with no
 * sockets and no database - which is the whole point of keeping the rules
 * framework-free. A rule that can only be tested by standing up a server is a
 * rule that mostly does not get tested.
 */

const settings: RoomSettings = {
  ...DEFAULT_ROOM_SETTINGS,
  name: 'Test Room',
  map: 'ORBITAL_09',
  maxPlayers: 8,
  saboteurCount: 2,
  objectiveCount: 2,
  isPrivate: true,
};

let managers: MatchManager[] = [];

afterEach(() => {
  for (const manager of managers) manager.stopAll();
  managers = [];
});

function makePlayer(index: number, role: PlayerRole): MatchPlayer {
  const spawn = ORBITAL_09.spawns[index % ORBITAL_09.spawns.length]!;
  return {
    userId: `player-${index}`,
    username: `Crew_${index}`,
    avatar: 'operator-01',
    appearance: DEFAULT_APPEARANCE,
    level: 1,
    role,
    alive: true,
    connection: ConnectionState.CONNECTED,
    position: { x: spawn.x, y: spawn.y },
    velocity: { x: 0, y: 0 },
    facing: 'RIGHT',
    animation: 'IDLE',
    zone: 'CORRIDOR',
    lastInputSequence: 0,
    lastBroadcast: null,
    lastInputAt: Date.now(),
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

/** A match with `operators` Operators and `saboteurs` Saboteurs, all alive. */
function makeMatch(operators = 4, saboteurs = 1, overrides: Partial<RoomSettings> = {}): Match {
  const players = new Map<string, MatchPlayer>();
  let index = 0;

  for (let i = 0; i < saboteurs; i++) players.set(`player-${index}`, makePlayer(index++, PlayerRole.SABOTEUR));
  for (let i = 0; i < operators; i++) players.set(`player-${index}`, makePlayer(index++, PlayerRole.OPERATOR));

  const now = Date.now();

  return {
    id: 'match-1',
    roomId: 'room-1',
    code: 'ABC123',
    map: ORBITAL_09,
    settings: { ...settings, ...overrides },
    phase: GamePhase.PLAYING,
    phaseStartedAt: now,
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
    startedAt: now,
    endedAt: null,
    outcome: null,
  };
}

const saboteurOf = (match: Match) =>
  [...match.players.values()].find((p) => p.role === PlayerRole.SABOTEUR)!;
const operatorsOf = (match: Match) =>
  [...match.players.values()].filter((p) => p.role === PlayerRole.OPERATOR);

/* ============================================================ roles = */

describe('role assignment', () => {
  it('deals exactly the requested number of Saboteurs', () => {
    const roles = assignRoles(['a', 'b', 'c', 'd', 'e', 'f', 'g'], 2);
    const saboteurs = [...roles.values()].filter((r) => r === PlayerRole.SABOTEUR);
    assert.equal(saboteurs.length, 2);
    assert.equal(roles.size, 7);
  });

  it('never deals Saboteurs at or above parity, whatever it is asked for', () => {
    // Settings validation should prevent this, but role assignment is the last
    // gate before a match that is over on its first tick.
    const roles = assignRoles(['a', 'b', 'c', 'd'], 3);
    const saboteurs = [...roles.values()].filter((r) => r === PlayerRole.SABOTEUR).length;
    assert.ok(saboteurs < 4 - saboteurs, `${saboteurs} saboteurs among 4 players`);
  });

  it('spreads the role across players rather than favouring a position', () => {
    // A biased shuffle - or one seeded predictably - would concentrate the role
    // on particular seats. 2000 deals is enough to see a stuck index.
    const counts = new Map<string, number>();
    const ids = ['a', 'b', 'c', 'd', 'e'];

    for (let i = 0; i < 2000; i++) {
      for (const [id, role] of assignRoles(ids, 1)) {
        if (role === PlayerRole.SABOTEUR) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }

    for (const id of ids) {
      const share = (counts.get(id) ?? 0) / 2000;
      // Expected 0.2 each. A wide band, because this is testing "not broken",
      // not the quality of the CSPRNG.
      assert.ok(share > 0.13 && share < 0.27, `${id} drew the role ${share * 100}% of the time`);
    }
  });

  it('does not lose or duplicate entries when shuffling', () => {
    const input = Array.from({ length: 50 }, (_, i) => i);
    const shuffled = secureShuffle(input);
    assert.equal(shuffled.length, 50);
    assert.deepEqual([...shuffled].sort((a, b) => a - b), input);
  });
});

/* ========================================================= movement = */

describe('movement', () => {
  it('integrates a direction rather than accepting a position', () => {
    const match = makeMatch();
    const player = operatorsOf(match)[0]!;
    const startX = player.position.x;

    applyInput(match, player, { sequence: 1, direction: { x: 1, y: 0 }, deltaMs: 16 });
    for (let i = 0; i < 20; i++) stepPlayer(match, player, 1 / 20);

    assert.ok(player.position.x > startX, 'should have moved');
  });

  it('rejects a replayed sequence', () => {
    const match = makeMatch();
    const player = operatorsOf(match)[0]!;

    assert.equal(
      applyInput(match, player, { sequence: 5, direction: { x: 1, y: 0 }, deltaMs: 16 }).accepted,
      true,
    );
    const replay = applyInput(match, player, {
      sequence: 5,
      direction: { x: 1, y: 0 },
      deltaMs: 16,
    });
    assert.equal(replay.accepted, false);
    assert.equal(replay.reason, 'replay');
  });

  it('clamps an over-long direction vector to walking speed', () => {
    const match = makeMatch();
    const fast = operatorsOf(match)[0]!;
    const normal = operatorsOf(match)[1]!;
    fast.position = { x: 700, y: 1020 };
    normal.position = { x: 700, y: 1020 };

    // The speed hack: a direction of length 50 rather than 1.
    applyInput(match, fast, { sequence: 1, direction: { x: 50, y: 0 }, deltaMs: 16 });
    applyInput(match, normal, { sequence: 1, direction: { x: 1, y: 0 }, deltaMs: 16 });

    for (let i = 0; i < 10; i++) {
      stepPlayer(match, fast, 1 / 20);
      stepPlayer(match, normal, 1 / 20);
    }

    assert.ok(
      Math.abs(fast.position.x - normal.position.x) < 0.01,
      `forged vector travelled ${fast.position.x - normal.position.x} further`,
    );
  });

  it('refuses movement while a council is running', () => {
    const match = makeMatch();
    match.phase = GamePhase.COUNCIL;
    const player = operatorsOf(match)[0]!;

    const result = applyInput(match, player, {
      sequence: 1,
      direction: { x: 1, y: 0 },
      deltaMs: 16,
    });
    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'frozen');
  });

  it('refuses movement from a dead player', () => {
    const match = makeMatch();
    const player = operatorsOf(match)[0]!;
    player.alive = false;

    assert.equal(
      applyInput(match, player, { sequence: 1, direction: { x: 1, y: 0 }, deltaMs: 16 }).accepted,
      false,
    );
  });

  it('does not let a player walk through a station wall', () => {
    const match = makeMatch();
    const player = operatorsOf(match)[0]!;

    /*
     * Inside Medical Bay, walking hard into its north wall - and deliberately
     * NOT at x=980, which is inside the doorway. The first version of this test
     * put the player in the door and then asserted they could not leave.
     */
    player.position = { x: 800, y: 700 };
    applyInput(match, player, { sequence: 1, direction: { x: 0, y: -1 }, deltaMs: 16 });
    for (let i = 0; i < 200; i++) stepPlayer(match, player, 1 / 20);

    // Medical Bay's interior starts at y=620; the wall is above it.
    assert.ok(player.position.y >= 620 - 1, `escaped to y=${player.position.y}`);
  });

  it('keeps players inside the hull', () => {
    const match = makeMatch();
    const player = operatorsOf(match)[0]!;
    player.position = { x: 60, y: 60 };

    applyInput(match, player, { sequence: 1, direction: { x: -1, y: -1 }, deltaMs: 16 });
    for (let i = 0; i < 400; i++) stepPlayer(match, player, 1 / 20);

    assert.ok(player.position.x >= ORBITAL_09.bounds.x);
    assert.ok(player.position.y >= ORBITAL_09.bounds.y);
  });
});

/* ======================================================== objectives = */

describe('objectives', () => {
  it('gives Operators tasks and Saboteurs none', () => {
    const match = makeMatch(4, 1);
    assignTasks(match, 2);

    for (const player of match.players.values()) {
      if (player.role === PlayerRole.SABOTEUR) assert.equal(player.tasks.length, 0);
      else assert.equal(player.tasks.length, 2);
    }
  });

  it('counts only Operator tasks toward the team total', () => {
    const match = makeMatch(4, 1);
    assignTasks(match, 2);

    // Four Operators, two tasks each, and some tasks are two-step.
    const expected = operatorsOf(match).reduce(
      (sum, player) => sum + player.tasks.reduce((s, task) => s + task.steps, 0),
      0,
    );
    assert.equal(match.taskTotal, expected);
  });

  /**
   * Every puzzle must be solvable from its prompt alone.
   *
   * This is the test that was missing, and its absence shipped a bug. The
   * SELECT puzzle chose a random subset of the options and sent nothing that
   * identified it, so an honest player had a 1-in-495 guess. Every existing
   * test passed: the server accepted a correct answer, refused a wrong one,
   * and kept the answer out of the prompt. None of them asked whether a person
   * could get there.
   *
   * So this solves each puzzle the way a player would - from the prompt, with
   * no access to the stored answer - and checks it is the answer. A rule that
   * cannot be written here is a rule a player cannot apply either.
   */
  function solveFromPrompt(prompt: PuzzlePrompt): number[] {
    switch (prompt.kind) {
      case 'ALIGN':
        // Match the dials to the targets you were shown.
        return [...prompt.targets!];
      case 'ORDER':
        // Put the scrambled readings in ascending order.
        return [...prompt.options].sort((a, b) => a - b);
      default:
        // Take every reading at or above the reference.
        return prompt.options.filter((v) => v >= prompt.reference!).sort((a, b) => a - b);
    }
  }

  const EVERY_TASK_TYPE = [
    'REACTOR_CALIBRATION',
    'SIGNAL_ROUTING',
    'OXYGEN_BALANCING',
    'DATA_RECOVERY',
    'POWER_SYNCHRONIZATION',
    'SECURITY_SCAN',
    'NAVIGATION_CALIBRATION',
  ] as const;

  for (const type of EVERY_TASK_TYPE) {
    it(`can be solved from the prompt alone: ${type}`, () => {
      // Repeated, because the failure being guarded against is probabilistic:
      // a puzzle that is usually solvable and sometimes ambiguous is still
      // broken, and one draw would not show it.
      for (let i = 0; i < 200; i++) {
        const task = { id: 't', type, zone: 'HUB', terminalId: 'x', duration: 1, steps: 1, progress: 0, status: 'PENDING' } as unknown as Parameters<typeof generatePuzzle>[0];
        const { prompt, answer } = generatePuzzle(task);

        assert.deepEqual(
          solveFromPrompt(prompt),
          answer,
          `a player following the rule did not reach the answer for ${type}`,
        );
      }
    });
  }

  it('gives a SELECT puzzle exactly as many qualifying options as it has slots', () => {
    for (let i = 0; i < 200; i++) {
      const task = { id: 't', type: 'SECURITY_SCAN', zone: 'HUB', terminalId: 'x', duration: 1, steps: 1, progress: 0, status: 'PENDING' } as unknown as Parameters<typeof generatePuzzle>[0];
      const { prompt } = generatePuzzle(task);

      const qualifying = prompt.options.filter((v) => v >= prompt.reference!);

      // Fewer would make the puzzle impossible; more would make it ambiguous,
      // and an ambiguous puzzle refuses a player who followed the rule.
      assert.equal(qualifying.length, prompt.slots);
      assert.equal(new Set(prompt.options).size, prompt.options.length, 'a tie could make it ambiguous');
    }
  });

  it('still keeps the ALIGN answer out of a SELECT prompt', () => {
    const task = { id: 't', type: 'SECURITY_SCAN', zone: 'HUB', terminalId: 'x', duration: 1, steps: 1, progress: 0, status: 'PENDING' } as unknown as Parameters<typeof generatePuzzle>[0];
    const { prompt, answer } = generatePuzzle(task);

    assert.equal(prompt.targets, undefined, 'targets would hand over the answer wholesale');
    assert.ok(answer.every((value) => prompt.options.includes(value)));
  });
  it('refuses a submission from too far away', () => {
    const match = makeMatch(4, 1);
    assignTasks(match, 2);

    const operator = operatorsOf(match)[0]!;
    const task = operator.tasks[0]!;
    const terminal = ORBITAL_09.terminals.find((t) => t.id === task.terminalId)!;

    operator.position = { x: terminal.position.x + 500, y: terminal.position.y };
    const result = openTask(match, operator, task.id);

    assert.equal(result.ok, false);
    assert.equal((result as { error: string }).error, 'OUT_OF_RANGE');
  });

  it('refuses a Saboteur trying to advance the bar', () => {
    const match = makeMatch(4, 1);
    assignTasks(match, 2);

    const saboteur = saboteurOf(match);
    const operator = operatorsOf(match)[0]!;
    const task = operator.tasks[0]!;
    const terminal = ORBITAL_09.terminals.find((t) => t.id === task.terminalId)!;

    // Standing at the right terminal, with a real task id: still refused.
    saboteur.position = { x: terminal.position.x, y: terminal.position.y };
    const result = openTask(match, saboteur, task.id);

    assert.equal(result.ok, false);
    assert.equal((result as { error: string }).error, 'NOT_OPERATOR');
  });

  it('accepts a correct answer and advances the team bar', () => {
    const match = makeMatch(4, 1);
    assignTasks(match, 1);

    const operator = operatorsOf(match)[0]!;
    const task = operator.tasks[0]!;
    const terminal = ORBITAL_09.terminals.find((t) => t.id === task.terminalId)!;
    operator.position = { x: terminal.position.x, y: terminal.position.y };

    const opened = openTask(match, operator, task.id);
    assert.equal(opened.ok, true);

    const pending = [...match.puzzles.values()][0]!;
    const before = teamProgress(match).completed;

    const submitted = submitStep(
      match,
      operator,
      task.id,
      0,
      pending.answer,
      Date.now() + 10_000,
    );

    assert.equal(submitted.ok, true);
    assert.equal(teamProgress(match).completed, before + 1);
  });

  it('refuses a wrong answer', () => {
    const match = makeMatch(4, 1);
    assignTasks(match, 1);

    const operator = operatorsOf(match)[0]!;
    const task = operator.tasks[0]!;
    const terminal = ORBITAL_09.terminals.find((t) => t.id === task.terminalId)!;
    operator.position = { x: terminal.position.x, y: terminal.position.y };

    openTask(match, operator, task.id);
    const pending = [...match.puzzles.values()][0]!;

    const result = submitStep(
      match,
      operator,
      task.id,
      0,
      pending.answer.map((value) => value + 1),
      Date.now() + 10_000,
    );

    assert.equal(result.ok, false);
    assert.equal((result as { error: string }).error, 'WRONG_ANSWER');
  });

  it('refuses an instant submission', () => {
    const match = makeMatch(4, 1);
    assignTasks(match, 1);

    const operator = operatorsOf(match)[0]!;
    const task = operator.tasks[0]!;
    const terminal = ORBITAL_09.terminals.find((t) => t.id === task.terminalId)!;
    operator.position = { x: terminal.position.x, y: terminal.position.y };

    openTask(match, operator, task.id);
    const pending = [...match.puzzles.values()][0]!;

    // The right answer, submitted immediately. Timed against the server's own
    // issue time, not the client's claim.
    const result = submitStep(match, operator, task.id, 0, pending.answer, Date.now());

    assert.equal(result.ok, false);
    assert.equal((result as { error: string }).error, 'TOO_FAST');
  });

  it('cannot replay a completed step', () => {
    const match = makeMatch(4, 1);
    assignTasks(match, 1);

    const operator = operatorsOf(match)[0]!;
    const task = operator.tasks[0]!;
    const terminal = ORBITAL_09.terminals.find((t) => t.id === task.terminalId)!;
    operator.position = { x: terminal.position.x, y: terminal.position.y };

    openTask(match, operator, task.id);
    const pending = [...match.puzzles.values()][0]!;
    const later = Date.now() + 10_000;

    submitStep(match, operator, task.id, 0, pending.answer, later);
    const before = teamProgress(match).completed;

    // Same step, same answer, again. The puzzle is gone, so the bar must not
    // move a second time.
    const replay = submitStep(match, operator, task.id, 0, pending.answer, later);
    assert.equal(replay.ok, false);
    assert.equal(teamProgress(match).completed, before);
  });
});

/* ======================================================= elimination = */

describe('elimination', () => {
  function adjacent(match: Match) {
    const killer = saboteurOf(match);
    const victim = operatorsOf(match)[0]!;
    killer.position = { x: 700, y: 1020 };
    victim.position = { x: 710, y: 1020 };
    return { killer, victim };
  }

  it('eliminates a nearby Operator and leaves a body', () => {
    const match = makeMatch();
    const { killer, victim } = adjacent(match);

    const result = eliminate(match, killer, victim.userId);

    assert.equal(result.ok, true);
    assert.equal(victim.alive, false);
    assert.equal(match.bodies.length, 1);
    assert.equal(match.bodies[0]!.playerId, victim.userId);
  });

  it('never names the killer in the outcome or on the body', () => {
    const match = makeMatch();
    const { killer, victim } = adjacent(match);

    const result = eliminate(match, killer, victim.userId);
    assert.equal(result.ok, true);

    const serialised = JSON.stringify((result as { outcome: unknown }).outcome);
    // The single most important assertion about elimination: working out who
    // did it is the entire game.
    assert.equal(
      serialised.includes(killer.userId),
      false,
      `the outcome leaked the killer: ${serialised}`,
    );
    assert.equal(JSON.stringify(match.bodies).includes(killer.userId), false);
  });

  it('refuses an Operator trying to eliminate', () => {
    const match = makeMatch();
    const [a, b] = operatorsOf(match);
    a!.position = { x: 700, y: 1020 };
    b!.position = { x: 710, y: 1020 };

    const result = eliminate(match, a!, b!.userId);
    assert.equal(result.ok, false);
    assert.equal((result as { error: string }).error, 'NOT_SABOTEUR');
  });

  it('refuses a target out of range', () => {
    const match = makeMatch();
    const killer = saboteurOf(match);
    const victim = operatorsOf(match)[0]!;
    killer.position = { x: 300, y: 1020 };
    victim.position = { x: 1400, y: 1020 };

    const result = eliminate(match, killer, victim.userId);
    assert.equal((result as { error: string }).error, 'OUT_OF_RANGE');
  });

  it('refuses while on cooldown', () => {
    const match = makeMatch(4, 1);
    primeCooldowns(match);
    const { killer, victim } = adjacent(match);

    const result = eliminate(match, killer, victim.userId);
    assert.equal((result as { error: string }).error, 'COOLDOWN');
  });

  it('refuses a fellow Saboteur, with the same error as any invalid target', () => {
    const match = makeMatch(3, 2);
    const [a, b] = [...match.players.values()].filter((p) => p.role === PlayerRole.SABOTEUR);
    a!.position = { x: 700, y: 1020 };
    b!.position = { x: 710, y: 1020 };

    const result = eliminate(match, a!, b!.userId);
    // Deliberately not a distinct error: a distinct one would let a Saboteur
    // probe who their allies are.
    assert.equal((result as { error: string }).error, 'TARGET_INVALID');
  });

  it('refuses during a meeting', () => {
    const match = makeMatch();
    const { killer, victim } = adjacent(match);
    openMeeting(match, killer, MeetingTrigger.EMERGENCY, null);

    const result = eliminate(match, killer, victim.userId);
    assert.equal((result as { error: string }).error, 'MEETING_ACTIVE');
  });
});

/* ==================================================== body reporting = */

describe('body reporting', () => {
  it('lets a nearby living player report', () => {
    const match = makeMatch();
    const killer = saboteurOf(match);
    const [victim, witness] = operatorsOf(match);
    killer.position = { x: 700, y: 1020 };
    victim!.position = { x: 710, y: 1020 };

    eliminate(match, killer, victim!.userId);
    witness!.position = { x: 715, y: 1020 };

    const result = reportBody(match, witness!, match.bodies[0]!.id);
    assert.equal(result.ok, true);
    assert.equal(match.bodies[0]!.reported, true);
  });

  it('refuses a report from across the station', () => {
    const match = makeMatch();
    const killer = saboteurOf(match);
    const [victim, witness] = operatorsOf(match);
    killer.position = { x: 700, y: 1020 };
    victim!.position = { x: 710, y: 1020 };
    eliminate(match, killer, victim!.userId);

    witness!.position = { x: 2200, y: 300 };
    const result = reportBody(match, witness!, match.bodies[0]!.id);
    assert.equal((result as { error: string }).error, 'OUT_OF_RANGE');
  });

  it('lets the killer report their own victim', () => {
    const match = makeMatch();
    const killer = saboteurOf(match);
    const victim = operatorsOf(match)[0]!;
    killer.position = { x: 700, y: 1020 };
    victim.position = { x: 710, y: 1020 };
    eliminate(match, killer, victim.userId);

    // A real tactic, and refusing it would identify them instantly.
    const result = reportBody(match, killer, match.bodies[0]!.id);
    assert.equal(result.ok, true);
  });

  it('refuses a second report of the same body', () => {
    const match = makeMatch();
    const killer = saboteurOf(match);
    const [victim, witness] = operatorsOf(match);
    killer.position = { x: 700, y: 1020 };
    victim!.position = { x: 710, y: 1020 };
    eliminate(match, killer, victim!.userId);
    witness!.position = { x: 715, y: 1020 };

    reportBody(match, witness!, match.bodies[0]!.id);
    const again = reportBody(match, witness!, match.bodies[0]!.id);
    assert.equal((again as { error: string }).error, 'ALREADY_REPORTED');
  });
});

/* ========================================================== sabotage = */

describe('sabotage', () => {
  it('starts a critical sabotage with a countdown and two stations', () => {
    const match = makeMatch();
    const result = startSabotage(match, saboteurOf(match), 'REACTOR_FAILURE');

    assert.equal(result.ok, true);
    assert.equal(match.sabotage?.critical, true);
    assert.equal(match.sabotage?.requiredStations, 2);
  });

  it('never records who triggered it', () => {
    const match = makeMatch();
    const saboteur = saboteurOf(match);
    startSabotage(match, saboteur, 'REACTOR_FAILURE');

    assert.equal(
      JSON.stringify(match.sabotage).includes(saboteur.userId),
      false,
      'the sabotage payload names its author',
    );
  });

  it('refuses an Operator', () => {
    const match = makeMatch();
    const result = startSabotage(match, operatorsOf(match)[0]!, 'OXYGEN_LEAK');
    assert.equal((result as { error: string }).error, 'NOT_SABOTEUR');
  });

  it('holds the cooldown against the team, not the individual', () => {
    const match = makeMatch(3, 2);
    const [a, b] = [...match.players.values()].filter((p) => p.role === PlayerRole.SABOTEUR);

    startSabotage(match, a!, 'POWER_FAILURE');
    match.sabotage = null; // simulate it being repaired

    // The second Saboteur must not be able to re-break the station at once.
    const result = startSabotage(match, b!, 'POWER_FAILURE');
    assert.equal((result as { error: string }).error, 'COOLDOWN');
  });

  it('needs every station worked to clear a critical sabotage', () => {
    const match = makeMatch();
    startSabotage(match, saboteurOf(match), 'REACTOR_FAILURE');

    const operator = operatorsOf(match)[0]!;
    const [first, second] = ORBITAL_09.repairStations;

    operator.position = { ...first!.position };
    const afterFirst = repair(match, operator, first!.id);
    assert.equal(afterFirst.ok, true);
    assert.notEqual(match.sabotage, null, 'one station should not be enough');

    operator.position = { ...second!.position };
    const afterSecond = repair(match, operator, second!.id);
    assert.equal(afterSecond.ok, true);
    assert.equal(match.sabotage, null, 'both stations should clear it');
  });

  it('refuses a repair from out of range', () => {
    const match = makeMatch();
    startSabotage(match, saboteurOf(match), 'REACTOR_FAILURE');

    const operator = operatorsOf(match)[0]!;
    operator.position = { x: 2300, y: 300 };

    const result = repair(match, operator, ORBITAL_09.repairStations[0]!.id);
    assert.equal((result as { error: string }).error, 'OUT_OF_RANGE');
  });
});

/* ====================================================== council/vote = */

describe('council, chat and voting', () => {
  it('clears bodies when a council opens', () => {
    const match = makeMatch();
    const killer = saboteurOf(match);
    const victim = operatorsOf(match)[0]!;
    killer.position = { x: 700, y: 1020 };
    victim.position = { x: 710, y: 1020 };
    eliminate(match, killer, victim.userId);

    openMeeting(match, killer, MeetingTrigger.BODY_REPORT, victim.userId);

    // Otherwise one death could trigger two meetings.
    assert.equal(match.bodies.length, 0);
  });

  it('never delivers a dead player message to a living socket', () => {
    const match = makeMatch();
    const ghost = operatorsOf(match)[0]!;
    ghost.alive = false;

    const composed = composeMessage(match, ghost, 'I saw who did it');
    assert.equal(composed.ok, true);

    const message = (composed as { message: { channel: string } }).message;
    assert.equal(message.channel, 'DEAD');

    const recipients = recipientsFor(match, message as never);
    // The enforcement point. A living player is not in this list, so the
    // message is never written to their socket at all.
    assert.equal(
      recipients.some((player) => player.alive),
      false,
      'a living player was in the recipient list for dead chat',
    );
  });

  it('filters profanity before fan-out, not on the client', () => {
    const match = makeMatch();
    const player = operatorsOf(match)[0]!;
    openMeeting(match, player, MeetingTrigger.EMERGENCY, null);

    const composed = composeMessage(match, player, 'you are a shit liar');
    const message = (composed as { message: { body: string; filtered: boolean } }).message;

    assert.equal(message.filtered, true);
    assert.equal(message.body.includes('shit'), false);
  });

  it('refuses a vote from a dead player', () => {
    const match = makeMatch();
    const caller = operatorsOf(match)[0]!;
    const ghost = operatorsOf(match)[1]!;

    openMeeting(match, caller, MeetingTrigger.EMERGENCY, null);
    match.phase = GamePhase.VOTING;
    openVoting(match);
    ghost.alive = false;

    const result = castVote(match, ghost, match.meeting!.id, SKIP_VOTE);
    assert.equal((result as { error: string }).error, 'DEAD');
  });

  it('refuses a second vote', () => {
    const match = makeMatch();
    const voter = operatorsOf(match)[0]!;
    openMeeting(match, voter, MeetingTrigger.EMERGENCY, null);
    match.phase = GamePhase.VOTING;
    openVoting(match);

    assert.equal(castVote(match, voter, match.meeting!.id, SKIP_VOTE).ok, true);
    const again = castVote(match, voter, match.meeting!.id, SKIP_VOTE);
    assert.equal((again as { error: string }).error, 'ALREADY_VOTED');
  });

  it('omits the target from the broadcast when voting is anonymous', () => {
    const match = makeMatch(4, 1, { anonymousVoting: true });
    const voter = operatorsOf(match)[0]!;
    const target = operatorsOf(match)[1]!;

    openMeeting(match, voter, MeetingTrigger.EMERGENCY, null);
    match.phase = GamePhase.VOTING;
    openVoting(match);

    const result = castVote(match, voter, match.meeting!.id, target.userId);
    assert.equal(result.ok, true);
    const vote = (result as unknown as { vote: Record<string, unknown> }).vote;

    // Absent, not present-and-hidden. The client is never sent a value it is
    // trusted to conceal.
    assert.equal('target' in vote, false, JSON.stringify(vote));
    assert.equal(vote.voterId, voter.userId);
  });

  it('ejects the player with the most votes', () => {
    const match = makeMatch(4, 1);
    const saboteur = saboteurOf(match);
    const voters = operatorsOf(match);

    openMeeting(match, voters[0]!, MeetingTrigger.EMERGENCY, null);
    match.phase = GamePhase.VOTING;
    openVoting(match);

    for (const voter of voters) castVote(match, voter, match.meeting!.id, saboteur.userId);

    const result = tallyVotes(match);
    assert.equal(result.outcome, 'EJECTED');
    assert.equal(result.ejectedId, saboteur.userId);
    assert.equal(saboteur.alive, false);
  });

  it('ejects nobody on a tie', () => {
    const match = makeMatch(4, 1);
    const [a, b, c, d] = operatorsOf(match);

    openMeeting(match, a!, MeetingTrigger.EMERGENCY, null);
    match.phase = GamePhase.VOTING;
    openVoting(match);

    castVote(match, a!, match.meeting!.id, c!.userId);
    castVote(match, b!, match.meeting!.id, c!.userId);
    castVote(match, c!, match.meeting!.id, d!.userId);
    castVote(match, d!, match.meeting!.id, a!.userId);
    castVote(match, saboteurOf(match), match.meeting!.id, d!.userId);

    const result = tallyVotes(match);
    assert.equal(result.outcome, 'TIED');
    assert.equal(result.ejectedId, null);
  });

  it('withholds the ejected role when confirmation is off', () => {
    const match = makeMatch(4, 1, { confirmEjection: false });
    const saboteur = saboteurOf(match);
    const voters = operatorsOf(match);

    openMeeting(match, voters[0]!, MeetingTrigger.EMERGENCY, null);
    match.phase = GamePhase.VOTING;
    openVoting(match);
    for (const voter of voters) castVote(match, voter, match.meeting!.id, saboteur.userId);

    const result = tallyVotes(match);
    assert.equal(result.ejectedId, saboteur.userId);
    assert.equal(result.ejectedRole, null, 'the role must not be sent');
    assert.equal(result.saboteursRemaining, null);
  });

  it('reveals the ejected role when confirmation is on', () => {
    const match = makeMatch(4, 1, { confirmEjection: true });
    const saboteur = saboteurOf(match);
    const voters = operatorsOf(match);

    openMeeting(match, voters[0]!, MeetingTrigger.EMERGENCY, null);
    match.phase = GamePhase.VOTING;
    openVoting(match);
    for (const voter of voters) castVote(match, voter, match.meeting!.id, saboteur.userId);

    const result = tallyVotes(match);
    assert.equal(result.ejectedRole, PlayerRole.SABOTEUR);
  });

  it('hides voter identities in the tally when anonymous', () => {
    const match = makeMatch(4, 1, { anonymousVoting: true });
    const voters = operatorsOf(match);

    openMeeting(match, voters[0]!, MeetingTrigger.EMERGENCY, null);
    match.phase = GamePhase.VOTING;
    openVoting(match);
    for (const voter of voters) castVote(match, voter, match.meeting!.id, SKIP_VOTE);

    const result = tallyVotes(match);
    for (const tally of result.tallies) {
      assert.deepEqual(tally.voterIds, [], 'anonymous tallies must not name voters');
    }
  });
});

/* ==================================================== win conditions = */

describe('win conditions', () => {
  it('gives Operators the win when every Saboteur is gone', () => {
    const match = makeMatch(4, 1);
    saboteurOf(match).alive = false;

    const outcome = evaluate(match);
    assert.equal(outcome?.winner, Team.OPERATORS);
    assert.equal(outcome?.reason, WinReason.SABOTEURS_ELIMINATED);
  });

  it('gives Saboteurs the win at parity, not majority', () => {
    const match = makeMatch(3, 1);
    const operators = operatorsOf(match);
    operators[0]!.alive = false;
    operators[1]!.alive = false;

    // One Operator, one Saboteur: they can no longer be voted out.
    const outcome = evaluate(match);
    assert.equal(outcome?.winner, Team.SABOTEURS);
    assert.equal(outcome?.reason, WinReason.SABOTEURS_REACHED_PARITY);
  });

  it('does not end the match while Operators outnumber Saboteurs', () => {
    const match = makeMatch(3, 1);
    assignTasks(match, 2);
    assert.equal(evaluate(match), null);
  });

  it('gives Operators the win when every objective is done', () => {
    const match = makeMatch(3, 1);
    assignTasks(match, 2);
    match.taskCompleted = match.taskTotal;

    const outcome = evaluate(match);
    assert.equal(outcome?.reason, WinReason.OBJECTIVES_COMPLETED);
  });

  it('lets an expired critical sabotage beat a completed objective bar', () => {
    const match = makeMatch(3, 1);
    assignTasks(match, 2);
    match.taskCompleted = match.taskTotal;

    startSabotage(match, saboteurOf(match), 'REACTOR_FAILURE');
    const afterExpiry = Date.now() + 60_000;

    // The station was already lost when the countdown hit zero.
    const outcome = evaluate(match, afterExpiry);
    assert.equal(outcome?.winner, Team.SABOTEURS);
    assert.equal(outcome?.reason, WinReason.CRITICAL_SABOTAGE);
  });

  it('awards the match when one side disconnects entirely', () => {
    const match = makeMatch(3, 1);
    assignTasks(match, 2);
    saboteurOf(match).connection = ConnectionState.DISCONNECTED;

    const outcome = evaluate(match);
    assert.equal(outcome?.reason, WinReason.TEAM_ABANDONED);
    assert.equal(outcome?.winner, Team.OPERATORS);
  });

  it('counts a reconnecting player as still in the match', () => {
    const match = makeMatch(3, 1);
    assignTasks(match, 2);
    // Their seat is held; they have not abandoned anything yet.
    saboteurOf(match).connection = ConnectionState.RECONNECTING;

    assert.equal(evaluate(match), null);
  });
});

/* ======================================================= serialisation = */

describe('wire serialisation', () => {
  it('never puts a role in the public snapshot', () => {
    const match = makeMatch(4, 2);
    assignTasks(match, 2);

    const snapshot = JSON.stringify(toSnapshot(match));

    assert.equal(snapshot.includes('SABOTEUR'), false, 'the snapshot leaked a role');
    assert.equal(snapshot.includes('OPERATOR'), false, 'the snapshot leaked a role');
    for (const player of snapshot.match(/"id":"player-\d+"/g) ?? []) {
      assert.ok(player);
    }
  });

  it('never puts a task list in the public snapshot', () => {
    const match = makeMatch(4, 1);
    assignTasks(match, 2);

    const snapshot = toSnapshot(match);
    for (const player of snapshot.players) {
      assert.equal('tasks' in player, false);
      assert.equal('taskIds' in player, false);
      assert.equal('killCooldownEndsAt' in player, false);
    }
  });

  it('gives a Saboteur their allies and an Operator none', () => {
    const match = makeMatch(3, 2);
    const [a, b] = [...match.players.values()].filter((p) => p.role === PlayerRole.SABOTEUR);

    const saboteurView = toSelfState(match, a!);
    assert.deepEqual(saboteurView.self.allyIds, [b!.userId]);

    const operatorView = toSelfState(match, operatorsOf(match)[0]!);
    assert.deepEqual(operatorView.self.allyIds, [], 'an Operator must learn nothing about anyone');
  });

  it('carries appearance publicly so every client can draw every player', () => {
    const match = makeMatch(4, 1);
    const snapshot = toSnapshot(match);

    for (const player of snapshot.players) {
      // The one field whose secrecy runs the opposite way to roles.
      assert.ok(player.appearance, `${player.id} has no appearance`);
    }
  });

  it('withholds zone while comms are down', () => {
    const match = makeMatch(4, 1);
    startSabotage(match, saboteurOf(match), 'COMMUNICATION_FAILURE');

    const snapshot = toSnapshot(match);
    for (const player of snapshot.players) {
      // Omitted, not flagged. Otherwise every client would hold the location of
      // every player during the one sabotage meant to take that away.
      assert.equal('zone' in player, false);
    }
  });

  it('still tells a player their own zone during a comms blackout', () => {
    const match = makeMatch(4, 1);
    const operator = operatorsOf(match)[0]!;
    startSabotage(match, saboteurOf(match), 'COMMUNICATION_FAILURE');

    // They can see the room they are standing in.
    assert.ok(toSelfState(match, operator).self.zone);
  });
});

/* ========================================================= lifecycle = */

describe('match lifecycle', () => {
  it('ends a match once and keeps the first reason', () => {
    const manager = new MatchManager({
      onSnapshot: () => {},
      onDelta: () => {},
      onSabotageUpdate: () => {},
      onMeetingOpenVoting: () => {},
      onMeetingResolved: () => {},
      onMatchEnded: () => {},
      onPhaseChange: () => {},
    });
    managers.push(manager);

    const match = makeMatch(3, 1);
    assignTasks(match, 2);
    saboteurOf(match).alive = false;

    assert.equal(manager.checkOutcome(match), true);
    assert.equal(match.outcome?.reason, WinReason.SABOTEURS_ELIMINATED);

    // A second evaluation must not overwrite the real reason with a later one.
    const first = match.outcome;
    manager.checkOutcome(match);
    assert.equal(match.outcome, first);
  });

  it('marks who survived when the match ends', () => {
    const manager = new MatchManager({
      onSnapshot: () => {},
      onDelta: () => {},
      onSabotageUpdate: () => {},
      onMeetingOpenVoting: () => {},
      onMeetingResolved: () => {},
      onMatchEnded: () => {},
      onPhaseChange: () => {},
    });
    managers.push(manager);

    const match = makeMatch(3, 1);
    const dead = operatorsOf(match)[0]!;
    dead.alive = false;
    saboteurOf(match).alive = false;

    manager.checkOutcome(match);

    assert.equal(dead.survived, false);
    assert.equal(operatorsOf(match)[1]!.survived, true);
  });
});

/* ====================================== a whole match, start to finish = */

describe('a full match', () => {
  it('plays from role assignment to an Operator win', () => {
    const match = makeMatch(3, 1);
    assignTasks(match, 2);

    const saboteur = saboteurOf(match);
    const operators = operatorsOf(match);

    // 1. The Saboteur eliminates an Operator.
    saboteur.position = { x: 700, y: 1020 };
    operators[0]!.position = { x: 710, y: 1020 };
    const killed = eliminate(match, saboteur, operators[0]!.userId);
    assert.equal(killed.ok, true);
    assert.equal(match.bodies.length, 1);

    // Not decided yet: two Operators against one Saboteur.
    assert.equal(evaluate(match), null);

    // 2. A survivor finds the body and reports it.
    operators[1]!.position = { x: 715, y: 1020 };
    assert.equal(reportBody(match, operators[1]!, match.bodies[0]!.id).ok, true);

    // 3. Council opens, bodies clear, movement freezes.
    openMeeting(match, operators[1]!, MeetingTrigger.BODY_REPORT, operators[0]!.userId);
    match.phase = GamePhase.COUNCIL;
    assert.equal(match.bodies.length, 0);
    assert.equal(
      applyInput(match, operators[1]!, { sequence: 9, direction: { x: 1, y: 0 }, deltaMs: 16 })
        .accepted,
      false,
    );

    // 4. Voting: the two living Operators vote out the Saboteur.
    match.phase = GamePhase.VOTING;
    openVoting(match);
    castVote(match, operators[1]!, match.meeting!.id, saboteur.userId);
    castVote(match, operators[2]!, match.meeting!.id, saboteur.userId);
    castVote(match, saboteur, match.meeting!.id, SKIP_VOTE);

    const result = tallyVotes(match);
    assert.equal(result.outcome, 'EJECTED');
    assert.equal(result.ejectedId, saboteur.userId);

    // 5. With the Saboteur gone, the Operators win.
    const outcome = evaluate(match);
    assert.equal(outcome?.winner, Team.OPERATORS);
    assert.equal(outcome?.reason, WinReason.SABOTEURS_ELIMINATED);

    // 6. And the voters who were right are credited.
    assert.equal(operators[1]!.correctEjectionVotes, 1);
    assert.equal(operators[2]!.correctEjectionVotes, 1);
  });

  it('plays to a Saboteur win by reaching parity', () => {
    const match = makeMatch(3, 1);
    assignTasks(match, 2);

    const saboteur = saboteurOf(match);
    const operators = operatorsOf(match);

    for (let i = 0; i < 2; i++) {
      saboteur.killCooldownEndsAt = null;
      saboteur.position = { x: 700, y: 1020 };
      operators[i]!.position = { x: 710, y: 1020 };

      const result = eliminate(match, saboteur, operators[i]!.userId);
      assert.equal(result.ok, true, `elimination ${i} failed`);
    }

    const outcome = evaluate(match);
    assert.equal(outcome?.winner, Team.SABOTEURS);
    assert.equal(outcome?.reason, WinReason.SABOTEURS_REACHED_PARITY);
    assert.equal(saboteur.eliminations, 2);
  });

  it('plays to an Operator win by completing every objective', () => {
    const match = makeMatch(3, 1);
    assignTasks(match, 1);

    const later = Date.now() + 60_000;

    for (const operator of operatorsOf(match)) {
      for (const task of operator.tasks) {
        while (task.status !== TaskStatus.COMPLETE) {
          const terminal = ORBITAL_09.terminals.find((t) => t.id === task.terminalId)!;
          operator.position = { ...terminal.position };

          const opened = openTask(match, operator, task.id);
          assert.equal(opened.ok, true);

          const pending = match.puzzles.get(`${operator.userId}:${task.id}:${task.progress}`)!;
          const submitted = submitStep(
            match,
            operator,
            task.id,
            task.progress,
            pending.answer,
            later,
          );
          assert.equal(submitted.ok, true);
        }
      }
    }

    assert.equal(teamProgress(match).ratio, 1);
    const outcome = evaluate(match);
    assert.equal(outcome?.reason, WinReason.OBJECTIVES_COMPLETED);
  });
});

/* ======================================================= connections = */

describe('match connections', () => {
  /** A manager that records how many snapshots it was asked to broadcast. */
  function makeManager() {
    let snapshots = 0;
    const manager = new MatchManager({
      onSnapshot: () => {
        snapshots += 1;
      },
      onDelta: () => {},
      onSabotageUpdate: () => {},
      onMeetingOpenVoting: () => {},
      onMeetingResolved: () => {},
      onMatchEnded: () => {},
      onPhaseChange: () => {},
    });
    managers.push(manager);
    return { manager, snapshots: () => snapshots };
  }

  it('stops a dropped player where they stood', () => {
    const { manager } = makeManager();
    const match = makeMatch();
    const player = operatorsOf(match)[0]!;

    // Mid-stride when the connection died.
    player.velocity.x = 120;
    player.velocity.y = -80;

    manager.setConnection(match, player.userId, ConnectionState.RECONNECTING);

    /*
     * Without this the simulation keeps integrating their last velocity for
     * the whole grace period, walking them into the nearest wall while every
     * other client draws an apparently healthy player strolling away.
     */
    assert.equal(player.velocity.x, 0);
    assert.equal(player.velocity.y, 0);
    assert.equal(player.connection, ConnectionState.RECONNECTING);
  });

  it('broadcasts the change, because game:state is not sent on a timer', () => {
    const { manager, snapshots } = makeManager();
    const match = makeMatch();

    const before = snapshots();
    manager.setConnection(match, operatorsOf(match)[0]!.userId, ConnectionState.RECONNECTING);

    // Snapshots otherwise only go out on a phase change, so without this the
    // roster would claim the player was still connected until the next
    // council - contradicting the player:disconnect sent on the same tick.
    assert.equal(snapshots(), before + 1);
  });

  it('leaves a returning player connected and moving again', () => {
    const { manager } = makeManager();
    const match = makeMatch();
    const player = operatorsOf(match)[0]!;

    manager.setConnection(match, player.userId, ConnectionState.RECONNECTING);
    manager.setConnection(match, player.userId, ConnectionState.CONNECTED);

    assert.equal(player.connection, ConnectionState.CONNECTED);
  });

  it('ignores a player who is not in this match', () => {
    const { manager } = makeManager();
    const match = makeMatch();

    // A stale socket for a different room must not throw its way out of the
    // disconnect handler and skip the cleanup that follows it.
    assert.doesNotThrow(() =>
      manager.setConnection(match, 'nobody-here', ConnectionState.RECONNECTING),
    );
  });

  it('re-checks the outcome, so a side that drops out entirely resolves', () => {
    const { manager } = makeManager();
    const match = makeMatch(1, 1);

    /*
     * The last Operator goes for good. Nothing else will happen in this match
     * - there is nobody left to kill, report or finish an objective - so if
     * the drop does not trigger the evaluation, the match runs on with no
     * possible winner until something times it out.
     */
    manager.setConnection(match, operatorsOf(match)[0]!.userId, ConnectionState.DISCONNECTED);

    assert.ok(match.outcome, 'a fully disconnected side did not resolve the match');
  });
});

/* ===================================================== delta bandwidth = */

describe('movement deltas', () => {
  it('rounds positions to whole units', () => {
    const match = makeMatch();
    const player = operatorsOf(match)[0]!;
    player.position.x = 640.4372119903564;
    player.position.y = 400.98765;

    const sent = toDelta(match).players.find((p) => p.id === player.userId)!;

    /*
     * Not only for the bytes. `640.4372119903564` is eighteen characters and
     * different every tick, so it defeats compression as well; `640` is three
     * and repeats. The server keeps full precision internally - this is the
     * wire only.
     */
    assert.equal(sent.position.x, 640);
    assert.equal(sent.position.y, 401);
  });

  it('omits players who have not moved since the last broadcast', () => {
    const match = makeMatch();

    // The first delta is unconditional: nobody has been told anything yet.
    assert.equal(toDelta(match).players.length, match.players.size);

    // Nothing moved in between.
    assert.deepEqual(toDelta(match).players, []);
  });

  it('carries a player who moved, and only that player', () => {
    const match = makeMatch();
    toDelta(match);

    const mover = operatorsOf(match)[0]!;
    mover.position.x += 40;

    const sent = toDelta(match).players;
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.id, mover.userId);
  });

  it('ignores movement too small to survive rounding', () => {
    const match = makeMatch();
    toDelta(match);

    // Sub-unit jitter produces the same quantised position, so it must not
    // put the player back on the wire ten times a second.
    operatorsOf(match)[0]!.position.x += 0.02;
    assert.deepEqual(toDelta(match).players, []);
  });

  it('sends a player once more when they stop', () => {
    const match = makeMatch();
    const mover = operatorsOf(match)[0]!;

    toDelta(match);
    mover.position.x += 40;
    toDelta(match);

    /*
     * The resting position has to reach the clients, or everyone else
     * interpolates toward where the player was still walking and leaves them
     * standing a stride away from where the server says they are.
     *
     * It arrives because "stopped" means the position differs from the last
     * one *sent*, not from the last one computed.
     */
    mover.position.x += 3;
    const sent = toDelta(match).players;
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.id, mover.userId);

    // And then nothing, for as long as they stand there.
    assert.deepEqual(toDelta(match).players, []);
  });

  it('notices a change of facing or animation with no movement at all', () => {
    const match = makeMatch();
    toDelta(match);

    const player = operatorsOf(match)[0]!;
    player.facing = player.facing === 'RIGHT' ? 'LEFT' : 'RIGHT';

    assert.equal(toDelta(match).players.length, 1, 'a turn on the spot was suppressed');
  });

  it('reports the dead as DEAD, and notices the moment they die', () => {
    const match = makeMatch();
    toDelta(match);

    const victim = operatorsOf(match)[0]!;
    victim.alive = false;

    const sent = toDelta(match).players;
    assert.equal(sent.length, 1);
    assert.equal(sent[0]!.animation, 'DEAD');
  });

  it('sends everybody in a keyframe, however still they are', () => {
    const match = makeMatch();
    toDelta(match);
    assert.deepEqual(toDelta(match).players, [], 'nothing moved');

    /*
     * The guarantee that makes suppression safe. A client holding a stale
     * position - a resumed socket, an adapter hiccup between instances -
     * repairs itself within a second rather than keeping it for the match.
     */
    assert.equal(toDelta(match, true).players.length, match.players.size);
  });

  it('is much smaller on the wire than sending everyone', () => {
    const match = makeMatch(11, 1);
    const everyone = JSON.stringify(toDelta(match, true)).length;

    // A typical lull: most of the lobby is at a terminal or reading chat.
    operatorsOf(match)[0]!.position.x += 40;
    const movers = JSON.stringify(toDelta(match)).length;

    assert.ok(
      movers < everyone / 4,
      `one mover cost ${movers} bytes against ${everyone} for the full roster`,
    );
  });
});
