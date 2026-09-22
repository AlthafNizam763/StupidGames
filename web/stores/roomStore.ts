'use client';

import { CLIENT_EVENT, SERVER_EVENT, type RoomSettings, type RoomState } from '@voidline/shared';
import { create } from 'zustand';
import { connectSocket, emitWithAck, getSocket } from '@/services/socket';

/**
 * The live room.
 *
 * Holds exactly what the server last broadcast and nothing derived from a local
 * guess. When a player taps Ready, this does not flip the flag optimistically -
 * it asks the server and waits for the next `room:state`. The lobby is shared
 * between people, and a client that renders its own guess shows one player
 * something different from everyone else.
 */

export type RoomConnection = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

interface RoomStoreState {
  room: RoomState | null;
  connection: RoomConnection;
  /** Why the room ended, when the server closed it or the player was removed. */
  exitReason: string | null;

  joinRoom: (code: string) => Promise<void>;
  leaveRoom: () => Promise<void>;
  setReady: (ready: boolean) => Promise<void>;
  updateSettings: (patch: Partial<RoomSettings>) => Promise<void>;
  kick: (userId: string) => Promise<void>;
  closeRoom: () => Promise<void>;
  startMatch: () => Promise<void>;

  /** Attaches server listeners. Returns a teardown for the effect that called it. */
  subscribe: () => () => void;
  reset: () => void;
}

export const useRoomStore = create<RoomStoreState>((set) => ({
  room: null,
  connection: 'idle',
  exitReason: null,

  subscribe() {
    const socket = getSocket();

    const onState = (room: RoomState) => set({ room, connection: 'connected' });
    const onClosed = ({ reason }: { reason: string }) =>
      set({ room: null, exitReason: reason });
    const onKicked = () =>
      set({ room: null, exitReason: 'The host removed you from the room.' });
    const onConnect = () => set({ connection: 'connected' });
    const onDisconnect = () => set({ connection: 'reconnecting' });

    socket.on(SERVER_EVENT.ROOM_STATE, onState);
    socket.on(SERVER_EVENT.ROOM_CLOSED, onClosed);
    socket.on(SERVER_EVENT.ROOM_KICKED, onKicked);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off(SERVER_EVENT.ROOM_STATE, onState);
      socket.off(SERVER_EVENT.ROOM_CLOSED, onClosed);
      socket.off(SERVER_EVENT.ROOM_KICKED, onKicked);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  },

  async joinRoom(code) {
    set({ connection: 'connecting', exitReason: null });

    const socket = connectSocket();

    // The socket may still be opening. Waiting for `connect` avoids an emit
    // that would be refused for not being connected yet.
    if (!socket.connected) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Could not reach the station.')), 10_000);
        socket.once('connect', () => {
          clearTimeout(timer);
          resolve();
        });
        socket.once('connect_error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
      });
    }

    const room = await emitWithAck<RoomState>(CLIENT_EVENT.ROOM_JOIN, { code });
    set({ room, connection: 'connected' });
  },

  async leaveRoom() {
    // Leaving is the one action that should succeed locally even if the server
    // never answers - the player has already decided to go.
    try {
      await emitWithAck(CLIENT_EVENT.ROOM_LEAVE);
    } finally {
      set({ room: null, connection: 'idle', exitReason: null });
    }
  },

  async setReady(ready) {
    await emitWithAck(CLIENT_EVENT.ROOM_READY, { ready });
  },

  async updateSettings(patch) {
    await emitWithAck(CLIENT_EVENT.ROOM_SETTINGS, patch);
  },

  async kick(userId) {
    await emitWithAck(CLIENT_EVENT.ROOM_KICK, { userId });
  },

  async closeRoom() {
    await emitWithAck(CLIENT_EVENT.ROOM_CLOSE);
    set({ room: null, connection: 'idle' });
  },

  async startMatch() {
    await emitWithAck(CLIENT_EVENT.ROOM_START);
  },

  reset() {
    set({ room: null, connection: 'idle', exitReason: null });
  },
}));

/** True when the signed-in player hosts the current room. */
export function selectIsHost(userId: string | undefined): boolean {
  const room = useRoomStore.getState().room;
  return Boolean(room && userId && room.hostId === userId);
}
