import { AVATAR_IDS } from '@voidline/shared';
import { z } from 'zod';
import { usernameSchema } from './authSchemas';

/**
 * Profile update input.
 *
 * Both fields are optional so the client can send only what changed, but the
 * object must not be empty - an update that changes nothing is a bug in the
 * caller, and answering "OK" to it hides that.
 *
 * The avatar is an enum over the shared roster rather than a free string, so an
 * arbitrary URL is rejected by the schema before any handler sees it.
 */
export const updateProfileSchema = z
  .object({
    username: usernameSchema.optional(),
    avatar: z.enum(AVATAR_IDS).optional(),
  })
  .refine((value) => value.username !== undefined || value.avatar !== undefined, {
    message: 'Nothing to update.',
  });

export const userIdParamSchema = z.object({
  // A Mongo ObjectId. Checking the shape here turns a malformed id into a clean
  // 400 rather than a CastError thrown from deep inside the driver.
  userId: z.string().regex(/^[a-f0-9]{24}$/i, 'That is not a valid player id.'),
});

export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;
export type UserIdParam = z.infer<typeof userIdParamSchema>;
