import type { CreateRoomInput, RoomState, RoomSummary } from '@voidline/shared';
import { http } from './http';

/**
 * Room API calls.
 *
 * `join` is a check, not a commitment: it answers "may I join this room?" and
 * returns what to show on the confirmation screen. Taking the seat happens over
 * the socket, because membership is live state the server has to be able to
 * revoke when the connection drops (SOCKET_EVENTS.md).
 */
export const roomsApi = {
  create(input: CreateRoomInput): Promise<RoomState> {
    return http.post<RoomState>('/api/rooms', input);
  },

  /** Validates joinability for the caller and returns the room preview. */
  join(code: string): Promise<RoomSummary> {
    return http.post<RoomSummary>('/api/rooms/join', { code });
  },

  /** Public-ish preview by code. Thinner than the lobby view: no roster. */
  preview(code: string): Promise<RoomSummary> {
    return http.get<RoomSummary>(`/api/rooms/code/${encodeURIComponent(code)}`);
  },

  /** The full lobby view. Members only. */
  state(roomId: string): Promise<RoomState> {
    return http.get<RoomState>(`/api/rooms/${roomId}`);
  },

  updateSettings(roomId: string, patch: Partial<CreateRoomInput>): Promise<RoomState> {
    return http.patch<RoomState>(`/api/rooms/${roomId}`, patch);
  },

  close(roomId: string): Promise<null> {
    return http.delete<null>(`/api/rooms/${roomId}`);
  },
};
