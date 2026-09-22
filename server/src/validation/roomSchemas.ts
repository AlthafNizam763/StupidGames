import { ALL_MAP_IDS, GameMode, ROOM_CODE_LENGTH, SETTINGS_BOUNDS } from '@voidline/shared';
import { z } from 'zod';

/**
 * Room input schemas.
 *
 * These check *shape and range* so a malformed request never reaches the
 * service. The cross-field rules - saboteurs below parity, players above the
 * minimum - live in `validateRoomSettings` in the shared package, which the
 * service runs on the result. Zod cannot express those without duplicating
 * logic the client also needs.
 */

const bounded = (bounds: { min: number; max: number }) =>
  z.coerce.number().int().min(bounds.min).max(bounds.max);

export const createRoomSchema = z.object({
  name: z
    .string()
    .trim()
    .min(SETTINGS_BOUNDS.roomNameLength.min)
    .max(SETTINGS_BOUNDS.roomNameLength.max),
  map: z.enum(ALL_MAP_IDS as unknown as [string, ...string[]]).optional(),
  gameMode: z.enum([GameMode.CLASSIC, GameMode.RAPID]).optional(),
  maxPlayers: bounded(SETTINGS_BOUNDS.maxPlayers).optional(),
  saboteurCount: bounded(SETTINGS_BOUNDS.saboteurCount).optional(),
  objectiveCount: bounded(SETTINGS_BOUNDS.objectiveCount).optional(),
  discussionTime: bounded(SETTINGS_BOUNDS.discussionTime).optional(),
  votingTime: bounded(SETTINGS_BOUNDS.votingTime).optional(),
  killCooldown: bounded(SETTINGS_BOUNDS.killCooldown).optional(),
  emergencyMeetingLimit: bounded(SETTINGS_BOUNDS.emergencyMeetingLimit).optional(),
  anonymousVoting: z.boolean().optional(),
  confirmEjection: z.boolean().optional(),
  isPrivate: z.boolean().optional(),
});

/** Every field optional, including the name, for a settings edit. */
export const updateRoomSchema = createRoomSchema.partial();

export const joinRoomSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .length(ROOM_CODE_LENGTH, `A room code is ${ROOM_CODE_LENGTH} characters.`),
});

export const roomCodeParamSchema = z.object({
  code: z.string().trim().toUpperCase().length(ROOM_CODE_LENGTH),
});

export const roomIdParamSchema = z.object({
  id: z.string().uuid('That is not a valid room id.'),
});

export type CreateRoomBody = z.infer<typeof createRoomSchema>;
export type UpdateRoomBody = z.infer<typeof updateRoomSchema>;
export type JoinRoomBody = z.infer<typeof joinRoomSchema>;
