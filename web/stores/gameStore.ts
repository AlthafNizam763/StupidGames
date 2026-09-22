'use client';

import {
  CLIENT_EVENT,
  SERVER_EVENT,
  type ChatMessage,
  type GameSelfState,
  type GameSnapshot,
  type MatchResult,
  type MovementDelta,
  type SabotageState,
  type TaskPuzzle,
  type VoteTarget,
  type VotingResult,
} from '@voidline/shared';
import { create } from 'zustand';
import { emitWithAck, getSocket } from '@/services/socket';

/**
 * Live match state, as the server last described it.
 *
 * Two things are deliberately NOT here:
 *
 * 1. Player positions. Those go straight into the engine's mutable world, not
 *    through React - a position update ten times a second through a store
 *    would re-render the tree ten times a second for something the canvas is
 *    already drawing.
 * 2. Anything derived. The snapshot is stored as received. A client that
 *    computed its own vote tally or win condition could disagree with the
 *    server, and the server is the one that is right.
 *
 * What is here is what the *interface* needs: phase, timers, the meeting, the
 * task bar, chat and this player's own private slice.
 */

export interface GameState {
  snapshot: GameSnapshot | null;
  self: GameSelfState | null;
  chat: ChatMessage[];
  result: MatchResult | null;
  votingResult: VotingResult | null;
  /** The puzzle currently open, if any. */
  puzzle: TaskPuzzle | null;

  /** Called by the engine bridge with each positional delta. */
  onDelta: ((delta: MovementDelta) => void) | null;
  setDeltaHandler: (handler: ((delta: MovementDelta) => void) | null) => void;

  subscribe: () => () => void;
  reset: () => void;

  /* -------------------------------------------------------- actions - */
  startTask: (taskId: string) => Promise<TaskPuzzle>;
  submitStep: (values: number[], elapsedMs: number) => Promise<TaskPuzzle | null>;
  eliminate: (targetId: string) => Promise<void>;
  reportBody: (bodyId: string) => Promise<void>;
  callEmergency: () => Promise<void>;
  sabotage: (type: string) => Promise<SabotageState>;
  repair: (stationId: string) => Promise<SabotageState | null>;
  sendChat: (channel: string, body: string) => Promise<void>;
  vote: (target: VoteTarget) => Promise<void>;
  resume: () => Promise<void>;
}

export const useGameStore = create<GameState>((set, get) => ({
  snapshot: null,
  self: null,
  chat: [],
  result: null,
  votingResult: null,
  puzzle: null,
  onDelta: null,

  setDeltaHandler: (handler) => set({ onDelta: handler }),

  subscribe() {
    const socket = getSocket();

    const onStart = ({ snapshot, self }: { snapshot: GameSnapshot; self: GameSelfState }) =>
      set({ snapshot, self, chat: [], result: null, votingResult: null });

    const onState = (snapshot: GameSnapshot) => set({ snapshot });
    const onSelf = (self: GameSelfState) => set({ self });

    /*
     * Deltas bypass the store entirely and go to the engine.
     *
     * This is the one handler that must not call `set`. It fires ten times a
     * second, and routing it through React state would re-render every
     * subscribed component at that rate for data the canvas draws itself.
     */
    const onDelta = (delta: MovementDelta) => get().onDelta?.(delta);

    const onChat = (message: ChatMessage) =>
      // Bounded: a long match would otherwise grow this without limit.
      set((state) => ({ chat: [...state.chat, message].slice(-200) }));

    const onVotingResult = (votingResult: VotingResult) => set({ votingResult });
    const onResult = (result: MatchResult) => set({ result });

    socket.on(SERVER_EVENT.GAME_START, onStart);
    socket.on(SERVER_EVENT.GAME_STATE, onState);
    socket.on(SERVER_EVENT.GAME_SELF, onSelf);
    socket.on(SERVER_EVENT.GAME_DELTA, onDelta);
    socket.on(SERVER_EVENT.COUNCIL_CHAT, onChat);
    socket.on(SERVER_EVENT.COUNCIL_RESULT, onVotingResult);
    socket.on(SERVER_EVENT.GAME_RESULT, onResult);

    return () => {
      socket.off(SERVER_EVENT.GAME_START, onStart);
      socket.off(SERVER_EVENT.GAME_STATE, onState);
      socket.off(SERVER_EVENT.GAME_SELF, onSelf);
      socket.off(SERVER_EVENT.GAME_DELTA, onDelta);
      socket.off(SERVER_EVENT.COUNCIL_CHAT, onChat);
      socket.off(SERVER_EVENT.COUNCIL_RESULT, onVotingResult);
      socket.off(SERVER_EVENT.GAME_RESULT, onResult);
    };
  },

  reset: () =>
    set({ snapshot: null, self: null, chat: [], result: null, votingResult: null, puzzle: null }),

  /* ---------------------------------------------------------- actions - */

  async startTask(taskId) {
    const puzzle = await emitWithAck<TaskPuzzle>(CLIENT_EVENT.TASK_START, { taskId });
    set({ puzzle });
    return puzzle;
  },

  async submitStep(values, elapsedMs) {
    const puzzle = get().puzzle;
    if (!puzzle) throw new Error('No objective is open.');

    const next = await emitWithAck<TaskPuzzle | null>(CLIENT_EVENT.TASK_PROGRESS, {
      taskId: puzzle.taskId,
      step: puzzle.step,
      values,
      elapsedMs,
    });

    set({ puzzle: next });
    return next;
  },

  eliminate: (targetId) => emitWithAck(CLIENT_EVENT.PLAYER_ELIMINATE, { targetId }),
  reportBody: (bodyId) => emitWithAck(CLIENT_EVENT.BODY_REPORT, { bodyId }),
  callEmergency: () => emitWithAck(CLIENT_EVENT.COUNCIL_EMERGENCY),
  sabotage: (type) => emitWithAck<SabotageState>(CLIENT_EVENT.SABOTAGE_START, { type }),
  repair: (stationId) =>
    emitWithAck<SabotageState | null>(CLIENT_EVENT.SABOTAGE_REPAIR, { stationId }),

  async sendChat(channel, body) {
    await emitWithAck(CLIENT_EVENT.COUNCIL_CHAT, { channel, body });
  },

  async vote(target) {
    const meetingId = get().snapshot?.meeting?.id;
    if (!meetingId) throw new Error('No council is in session.');
    await emitWithAck(CLIENT_EVENT.COUNCIL_VOTE, { meetingId, target });
  },

  /**
   * Rebuilds after a reconnect (§29).
   *
   * The returned state replaces what the client had rather than being merged
   * into it: the client cannot know what happened while it was away, so
   * anything it still holds is a guess.
   */
  async resume() {
    const resumed = await emitWithAck<{
      snapshot: GameSnapshot;
      self: GameSelfState;
      missedMessages: ChatMessage[];
    }>(CLIENT_EVENT.GAME_RESUME);

    set({
      snapshot: resumed.snapshot,
      self: resumed.self,
      chat: resumed.missedMessages,
    });
  },
}));
