import { SERVER_EVENT } from '@voidline/shared';
import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';
import type { useGameStore as UseGameStore } from './gameStore';

/**
 * The match store (§48).
 *
 * Two properties are worth locking down here, and neither is about React.
 *
 * The first is a performance invariant that cannot be seen by reading a
 * component: movement deltas arrive ten times a second and must not reach
 * `set`, because every subscribed component would re-render at that rate for
 * data the canvas draws itself (§40, §41). Nothing throws if that regresses -
 * the game just gets slower on exactly the phones it most needs to run on.
 *
 * The second is that the store is a *reducer over server events*. It has no
 * opinion about roles, votes or outcomes; it records what the server said. A
 * test that asserted a derived winner here would be asserting client
 * authority, which is the thing the whole design refuses.
 *
 * `@/services/socket` is mocked with a plain event registry, so the store's
 * real subscribe/unsubscribe wiring runs without a network.
 */

interface Registry {
  handlers: Map<string, Set<(payload: unknown) => void>>;
  emit: (event: string, payload: unknown) => void;
}

const registry: Registry = {
  handlers: new Map(),
  emit(event, payload) {
    for (const handler of registry.handlers.get(event) ?? []) handler(payload);
  },
};

const fakeSocket = {
  on(event: string, handler: (payload: unknown) => void) {
    const set = registry.handlers.get(event) ?? new Set();
    set.add(handler);
    registry.handlers.set(event, set);
  },
  off(event: string, handler: (payload: unknown) => void) {
    registry.handlers.get(event)?.delete(handler);
  },
};

mock.module('@/services/socket', {
  /*
   * `exports` is the current field name; the installed @types/node still only
   * describes the deprecated `namedExports`, which the runtime warns about. The
   * cast keeps the correct field and a quiet test run.
   */
  exports: {
    getSocket: () => fakeSocket,
    emitWithAck: async () => null,
  },
} as unknown as Parameters<typeof mock.module>[1]);

/*
 * Imported in `before` rather than at the top of the file. The store has to be
 * loaded *after* the mock is registered, and this package compiles to CommonJS,
 * so a top-level await is not available to sequence it.
 */
let useGameStore: typeof UseGameStore;

describe('gameStore', () => {
  before(async () => {
    ({ useGameStore } = await import('./gameStore'));
  });

  beforeEach(() => {
    registry.handlers.clear();
    useGameStore.getState().reset();
    useGameStore.getState().setDeltaHandler(null);
  });

  it('records what the server sent on game:start', () => {
    const unsubscribe = useGameStore.getState().subscribe();

    const snapshot = { matchId: 'm1', phase: 'PLAYING' };
    const self = { self: { id: 'p1', role: 'OPERATOR' }, tasks: [{ id: 't1' }] };
    registry.emit(SERVER_EVENT.GAME_START, { snapshot, self });

    const state = useGameStore.getState();
    assert.equal(state.snapshot, snapshot);
    assert.equal(state.self, self);

    unsubscribe();
  });

  it('routes movement deltas to the engine and never through React state', () => {
    const unsubscribe = useGameStore.getState().subscribe();

    const seen: unknown[] = [];
    useGameStore.getState().setDeltaHandler((delta) => seen.push(delta));

    let renders = 0;
    const stopWatching = useGameStore.subscribe(() => {
      renders += 1;
    });

    for (let i = 0; i < 20; i++) {
      registry.emit(SERVER_EVENT.GAME_DELTA, { players: [], serverTime: i });
    }

    assert.equal(seen.length, 20, 'the engine did not receive the deltas');
    assert.equal(renders, 0, 'a movement delta reached React state');

    stopWatching();
    unsubscribe();
  });

  it('bounds the chat log so a long match cannot grow it without limit', () => {
    const unsubscribe = useGameStore.getState().subscribe();

    for (let i = 0; i < 260; i++) {
      registry.emit(SERVER_EVENT.COUNCIL_CHAT, { id: `m${i}`, body: `line ${i}` });
    }

    const chat = useGameStore.getState().chat;
    assert.equal(chat.length, 200);
    // The newest are kept, not the oldest - a player scrolled to the bottom
    // must see what was just said.
    assert.equal((chat[chat.length - 1] as { id: string }).id, 'm259');

    unsubscribe();
  });

  it('stores the voting result the server decided, and derives nothing', () => {
    const unsubscribe = useGameStore.getState().subscribe();

    const result = { outcome: 'EJECTED', ejectedId: 'p3', ejectedRole: 'SABOTEUR', tally: [] };
    registry.emit(SERVER_EVENT.COUNCIL_RESULT, result);

    assert.equal(useGameStore.getState().votingResult, result);

    unsubscribe();
  });

  it('detaches every handler on unsubscribe', () => {
    const unsubscribe = useGameStore.getState().subscribe();
    unsubscribe();

    registry.emit(SERVER_EVENT.GAME_STATE, { matchId: 'leaked' });
    assert.equal(useGameStore.getState().snapshot, null, 'a handler outlived its subscription');
  });

  it('clears the match on reset, so the next one does not inherit it', () => {
    const unsubscribe = useGameStore.getState().subscribe();

    registry.emit(SERVER_EVENT.GAME_STATE, { matchId: 'm1' });
    registry.emit(SERVER_EVENT.GAME_RESULT, { winner: 'OPERATORS' });
    registry.emit(SERVER_EVENT.COUNCIL_CHAT, { id: 'm1', body: 'hi' });

    useGameStore.getState().reset();

    const state = useGameStore.getState();
    assert.equal(state.snapshot, null);
    assert.equal(state.result, null);
    assert.equal(state.self, null);
    assert.deepEqual(state.chat, []);

    unsubscribe();
  });
});
