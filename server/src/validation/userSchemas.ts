import {
  ACCESSORIES,
  AVATAR_IDS,
  BACKPACKS,
  BodyType,
  HAIR_COLOURS,
  HAIR_STYLES,
  OUTFITS,
  SHOES,
  SKIN_TONES,
} from '@voidline/shared';
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
/**
 * A complete character.
 *
 * Every slot is an enum over the shared roster, so an unknown id is refused at
 * the boundary rather than reaching the renderer. Required as a whole: a
 * half-specified character is not something the server can store or the client
 * can draw.
 */
export const appearanceSchema = z.object({
  body: z.enum([BodyType.BOY, BodyType.GIRL]),
  skin: z.enum(SKIN_TONES),
  hair: z.enum(HAIR_STYLES),
  hairColour: z.enum(HAIR_COLOURS),
  outfit: z.enum(OUTFITS),
  shoes: z.enum(SHOES),
  accessory: z.enum(ACCESSORIES).nullable(),
  backpack: z.enum(BACKPACKS).nullable(),
});

export const updateProfileSchema = z
  .object({
    username: usernameSchema.optional(),
    avatar: z.enum(AVATAR_IDS).optional(),
    appearance: appearanceSchema.optional(),
  })
  .refine(
    (value) =>
      value.username !== undefined || value.avatar !== undefined || value.appearance !== undefined,
    {
      message: 'Nothing to update.',
    },
  );

export const userIdParamSchema = z.object({
  // A Mongo ObjectId. Checking the shape here turns a malformed id into a clean
  // 400 rather than a CastError thrown from deep inside the driver.
  userId: z.string().regex(/^[a-f0-9]{24}$/i, 'That is not a valid player id.'),
});

export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;
export type UserIdParam = z.infer<typeof userIdParamSchema>;
