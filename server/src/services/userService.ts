import {
  ErrorCode,
  isAvatarId,
  isCharacterAppearance,
  type SelfUser,
  type UserProfile,
} from '@voidline/shared';
import { AppError } from '../lib/AppError';
import { logger } from '../lib/logger';
import { toSelfUser, toUserProfile, userRepository } from '../repositories/UserRepository';
import type { UpdateProfileBody } from '../validation/userSchemas';

/**
 * Account and profile rules.
 *
 * The recurring concern here is what a *different* player is allowed to see.
 * `toSelfUser` and `toUserProfile` are two different projections of the same
 * document on purpose: the first carries an email, the second must never.
 */
export const userService = {
  async getSelf(userId: string): Promise<SelfUser> {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError(ErrorCode.TOKEN_INVALID);
    return toSelfUser(user);
  },

  /**
   * A public profile.
   *
   * Disabled accounts are reported as not found rather than as disabled: a
   * banned player's profile page should not become a way for anyone to confirm
   * the ban.
   */
  async getProfile(userId: string): Promise<UserProfile> {
    const user = await userRepository.findById(userId);
    if (!user || user.disabled) throw new AppError(ErrorCode.NOT_FOUND, 'No such player.');
    return toUserProfile(user);
  },

  /**
   * Updates the caller's own username and avatar.
   *
   * Only these two fields. Level, XP, stats and achievements are written by the
   * server at match end and are not addressable from here - if this method
   * merged an arbitrary body into the document, every one of them would become
   * client-editable (SECURITY.md).
   */
  async updateProfile(userId: string, input: UpdateProfileBody): Promise<SelfUser> {
    const user = await userRepository.findById(userId);
    if (!user) throw new AppError(ErrorCode.TOKEN_INVALID);

    if (input.avatar !== undefined) {
      // Re-checked here as well as in the schema: this is the boundary that
      // keeps an arbitrary string - a URL, a path - out of the avatar field.
      if (!isAvatarId(input.avatar)) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'That is not an available avatar.', {
          fieldErrors: [{ path: 'avatar', message: 'Choose one of the available avatars.' }],
        });
      }
      user.avatar = input.avatar;
    }

    if (input.appearance !== undefined) {
      /*
       * Validated as a whole against the shared roster. A partial update would
       * let a caller set one slot to a value the renderer has no art for, and
       * the renderer would then have to guess - so the whole character is
       * replaced or the request is refused.
       */
      if (!isCharacterAppearance(input.appearance)) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'That is not a valid character.', {
          fieldErrors: [{ path: 'appearance', message: 'Choose from the available options.' }],
        });
      }
      user.appearance = input.appearance;
    }

    if (input.username !== undefined && input.username !== user.username) {
      const taken = await userRepository.findByUsername(input.username);
      // A case-only change to one's own name is allowed; the collation lookup
      // would otherwise find this very account and report it as taken.
      if (taken && taken.id !== user.id) throw new AppError(ErrorCode.USERNAME_TAKEN);
      user.username = input.username;
    }

    await user.save();
    logger.info({ userId }, 'profile updated');

    return toSelfUser(user);
  },
};

export type UserService = typeof userService;
