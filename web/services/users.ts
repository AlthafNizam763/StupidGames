import type { CharacterAppearance, SelfUser, UserProfile } from '@voidline/shared';
import { http } from './http';

/** Account and profile API calls. */
export const usersApi = {
  me(): Promise<SelfUser> {
    return http.get<SelfUser>('/api/users/me');
  },

  /**
   * Updates the caller's own profile.
   *
   * Username, avatar and appearance are the only fields the server accepts, and
   * it refuses an update that sets none of them. Sending anything else is not a
   * way to change it: the schema is closed, so an unknown key is rejected at the
   * boundary rather than quietly ignored.
   *
   * `appearance` is all-or-nothing. Every slot is required together, because a
   * half-specified character is not something the server can store or the client
   * can draw - so send the whole object, not the slot that changed.
   */
  updateMe(input: {
    username?: string;
    avatar?: string;
    appearance?: CharacterAppearance;
  }): Promise<SelfUser> {
    return http.patch<SelfUser>('/api/users/me', input);
  },

  profile(userId: string): Promise<UserProfile> {
    return http.get<UserProfile>(`/api/profile/${userId}`);
  },
};
