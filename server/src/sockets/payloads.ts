import { ROOM_CODE_LENGTH, SETTINGS_BOUNDS } from '@voidline/shared';
import { z } from 'zod';
import { ErrorCode } from '@voidline/shared';
import { AppError } from '../lib/AppError';

/**
 * Socket payload schemas.
 *
 * SOCKET_EVENTS.md says every socket payload is validated before it reaches a
 * manager. Until now that was true of the REST surface and *not* of the socket
 * surface, where handlers took whatever arrived and relied on the service to
 * notice. This closes that gap.
 *
 * Why it matters more here than over REST: a socket payload does not pass
 * through Express's body parser or the operator guard. It is whatever the
 * client serialised, delivered straight to a handler - so `{ code: { $ne: null } }`
 * or a 10MB string arrives intact unless something checks.
 *
 * Parsing also *narrows*: unknown keys are stripped, so a handler cannot read a
 * field the schema does not declare.
 */

export const joinRoomPayload = z.object({
  code: z.string().trim().toUpperCase().length(ROOM_CODE_LENGTH),
});

export const readyPayload = z.object({
  ready: z.boolean(),
});

export const kickPayload = z.object({
  // A Mongo ObjectId. Shape-checked here so a malformed id is a clean
  // rejection rather than a cast error from inside the driver.
  userId: z.string().regex(/^[a-f0-9]{24}$/i),
});

const bounded = (bounds: { min: number; max: number }) =>
  z.number().int().min(bounds.min).max(bounds.max);

/**
 * A settings patch.
 *
 * `.strict()` rather than the usual strip: a host sending an unknown setting
 * key is either running a modified client or running against a newer server,
 * and silently ignoring it would leave them believing a setting applied when it
 * did not.
 */
export const settingsPayload = z
  .object({
    name: z
      .string()
      .trim()
      .min(SETTINGS_BOUNDS.roomNameLength.min)
      .max(SETTINGS_BOUNDS.roomNameLength.max)
      .optional(),
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
  })
  .strict();

/**
 * Parses a payload, or throws the error the ack will carry.
 *
 * Deliberately returns a flat VALIDATION_ERROR rather than field detail. A
 * socket payload is built by our own client from typed events, so a failure
 * here is a bug or a forged message - neither of which benefits from a
 * field-by-field explanation, and the second should not be helped along.
 */
export function parsePayload<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'That request was not valid.', {
      context: {
        issues: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.code}`),
      },
    });
  }

  return result.data;
}
