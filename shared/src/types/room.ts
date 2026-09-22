import type { GameMode, GamePhase } from '../constants/game';
import type { MapId } from '../constants/map';
import type { ISODateString } from './common';
import type { CharacterAppearance } from '../constants/appearance';
import type { AvatarId, PublicUser, UserId } from './user';

export type RoomId = string;
/** Six-character human-shareable code. See ROOM_CODE_PATTERN. */
export type RoomCode = string;

/**
 * Host-configurable match rules. Every field is re-validated server-side on
 * create *and* on update - a host who edits settings mid-lobby goes through the
 * same gate as one who created the room.
 */
export interface RoomSettings {
  name: string;
  map: MapId;
  gameMode: GameMode;
  maxPlayers: number;
  saboteurCount: number;
  /** Objectives assigned per Operator. */
  objectiveCount: number;
  /** Seconds. */
  discussionTime: number;
  /** Seconds. */
  votingTime: number;
  /** Seconds. */
  killCooldown: number;
  emergencyMeetingLimit: number;
  anonymousVoting: boolean;
  /** When false, an ejection never reveals the ejected player's role. */
  confirmEjection: boolean;
  /** Private rooms are reachable by code only and never listed. */
  isPrivate: boolean;
}

/** Everything needed to create a room. Name aside, all fields fall back to defaults. */
export type CreateRoomInput = Partial<RoomSettings> & Pick<RoomSettings, 'name'>;

export const ConnectionState = {
  CONNECTED: 'CONNECTED',
  /** Socket dropped; seat held until the reconnect grace period expires. */
  RECONNECTING: 'RECONNECTING',
  /** Grace period expired or the player left deliberately. */
  DISCONNECTED: 'DISCONNECTED',
} as const;
export type ConnectionState = (typeof ConnectionState)[keyof typeof ConnectionState];

/** A seat in the lobby. Carries no role information - roles do not exist yet. */
export interface LobbyPlayer {
  userId: UserId;
  username: string;
  avatar: AvatarId;
  appearance: CharacterAppearance;
  level: number;
  isHost: boolean;
  isReady: boolean;
  connection: ConnectionState;
  joinedAt: ISODateString;
}

/** The public lobby view, broadcast to everyone in the room. */
export interface RoomState {
  id: RoomId;
  code: RoomCode;
  hostId: UserId;
  phase: GamePhase;
  settings: RoomSettings;
  players: LobbyPlayer[];
  /** Present once a match has begun. */
  matchId: string | null;
  createdAt: ISODateString;
}

/**
 * The preview shown before joining, from GET /api/rooms/:code. Deliberately
 * thinner than RoomState: it must not leak the roster of a room you are not in
 * beyond names and count.
 */
export interface RoomSummary {
  code: RoomCode;
  name: string;
  host: PublicUser;
  map: MapId;
  gameMode: GameMode;
  playerCount: number;
  maxPlayers: number;
  phase: GamePhase;
  isJoinable: boolean;
}
