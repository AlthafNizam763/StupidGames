import {
  DEFAULT_ROOM_SETTINGS,
  GameMode,
  MIN_PLAYERS_TO_START,
  SETTINGS_BOUNDS,
  maxSaboteursFor,
} from '../constants/game';
import { ALL_MAP_IDS, DEFAULT_MAP_ID, MapId } from '../constants/map';
import type { FieldError } from '../types/common';
import type { CreateRoomInput, RoomSettings } from '../types/room';

/**
 * Settings validation, shared by both sides on purpose.
 *
 * The client runs this to show inline errors as the host drags a slider. The
 * server runs the *same* function before persisting anything. Sharing it means
 * the two can never disagree about what is legal - but it does NOT mean the
 * server trusts the client: the server always re-runs it on the raw input.
 */

/** Per-mode baselines, applied before the host's own overrides. */
export const GAME_MODE_PRESETS: Readonly<
  Record<GameMode, Pick<RoomSettings, 'objectiveCount' | 'discussionTime' | 'votingTime' | 'killCooldown'>>
> = {
  [GameMode.CLASSIC]: {
    objectiveCount: DEFAULT_ROOM_SETTINGS.objectiveCount,
    discussionTime: DEFAULT_ROOM_SETTINGS.discussionTime,
    votingTime: DEFAULT_ROOM_SETTINGS.votingTime,
    killCooldown: DEFAULT_ROOM_SETTINGS.killCooldown,
  },
  [GameMode.RAPID]: {
    objectiveCount: 4,
    discussionTime: 20,
    votingTime: 20,
    killCooldown: 15,
  },
};

export interface SettingsValidation {
  valid: boolean;
  errors: FieldError[];
  /** Fully populated settings. Only meaningful when `valid` is true. */
  settings: RoomSettings;
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function checkRange(
  errors: FieldError[],
  path: string,
  value: number,
  bounds: { min: number; max: number },
): void {
  if (!isInteger(value)) {
    errors.push({ path, message: 'Must be a whole number.' });
    return;
  }
  if (value < bounds.min || value > bounds.max) {
    errors.push({ path, message: `Must be between ${bounds.min} and ${bounds.max}.` });
  }
}

/** Fills in defaults for anything the host did not set. Performs no validation. */
export function withDefaults(input: CreateRoomInput): RoomSettings {
  const gameMode: GameMode = input.gameMode ?? DEFAULT_ROOM_SETTINGS.gameMode;
  const preset = GAME_MODE_PRESETS[gameMode];

  return {
    name: typeof input.name === 'string' ? input.name.trim() : '',
    map: input.map ?? DEFAULT_MAP_ID,
    gameMode,
    maxPlayers: input.maxPlayers ?? DEFAULT_ROOM_SETTINGS.maxPlayers,
    saboteurCount: input.saboteurCount ?? DEFAULT_ROOM_SETTINGS.saboteurCount,
    objectiveCount: input.objectiveCount ?? preset.objectiveCount,
    discussionTime: input.discussionTime ?? preset.discussionTime,
    votingTime: input.votingTime ?? preset.votingTime,
    killCooldown: input.killCooldown ?? preset.killCooldown,
    emergencyMeetingLimit:
      input.emergencyMeetingLimit ?? DEFAULT_ROOM_SETTINGS.emergencyMeetingLimit,
    anonymousVoting: input.anonymousVoting ?? DEFAULT_ROOM_SETTINGS.anonymousVoting,
    confirmEjection: input.confirmEjection ?? DEFAULT_ROOM_SETTINGS.confirmEjection,
    isPrivate: input.isPrivate ?? true,
  };
}

export function validateRoomSettings(input: CreateRoomInput): SettingsValidation {
  const settings = withDefaults(input);
  const errors: FieldError[] = [];

  const { roomNameLength } = SETTINGS_BOUNDS;
  if (settings.name.length < roomNameLength.min || settings.name.length > roomNameLength.max) {
    errors.push({
      path: 'name',
      message: `Room name must be ${roomNameLength.min}-${roomNameLength.max} characters.`,
    });
  }

  if (!ALL_MAP_IDS.includes(settings.map as MapId)) {
    errors.push({ path: 'map', message: 'Unknown map.' });
  }

  if (settings.gameMode !== GameMode.CLASSIC && settings.gameMode !== GameMode.RAPID) {
    errors.push({ path: 'gameMode', message: 'Unknown game mode.' });
  }

  checkRange(errors, 'maxPlayers', settings.maxPlayers, SETTINGS_BOUNDS.maxPlayers);
  checkRange(errors, 'objectiveCount', settings.objectiveCount, SETTINGS_BOUNDS.objectiveCount);
  checkRange(errors, 'discussionTime', settings.discussionTime, SETTINGS_BOUNDS.discussionTime);
  checkRange(errors, 'votingTime', settings.votingTime, SETTINGS_BOUNDS.votingTime);
  checkRange(errors, 'killCooldown', settings.killCooldown, SETTINGS_BOUNDS.killCooldown);
  checkRange(
    errors,
    'emergencyMeetingLimit',
    settings.emergencyMeetingLimit,
    SETTINGS_BOUNDS.emergencyMeetingLimit,
  );
  checkRange(errors, 'saboteurCount', settings.saboteurCount, SETTINGS_BOUNDS.saboteurCount);

  if (typeof settings.anonymousVoting !== 'boolean') {
    errors.push({ path: 'anonymousVoting', message: 'Must be true or false.' });
  }
  if (typeof settings.confirmEjection !== 'boolean') {
    errors.push({ path: 'confirmEjection', message: 'Must be true or false.' });
  }

  // Cross-field rules. Only worth checking once the individual fields are sane.
  if (isInteger(settings.maxPlayers) && isInteger(settings.saboteurCount)) {
    if (settings.maxPlayers < MIN_PLAYERS_TO_START) {
      errors.push({
        path: 'maxPlayers',
        message: `A match needs at least ${MIN_PLAYERS_TO_START} players.`,
      });
    }

    const ceiling = maxSaboteursFor(settings.maxPlayers);
    if (settings.saboteurCount > ceiling) {
      errors.push({
        path: 'saboteurCount',
        message: `At most ${ceiling} ${ceiling === 1 ? 'Saboteur' : 'Saboteurs'} for ${settings.maxPlayers} players - Saboteurs must start outnumbered.`,
      });
    }
  }

  return { valid: errors.length === 0, errors, settings };
}
