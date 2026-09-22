import type { SelfUser, UserProfile } from '@voidline/shared';
import { http } from './http';

/** Account and profile API calls. */
export const usersApi = {
  me(): Promise<SelfUser> {
    return http.get<SelfUser>('/api/users/me');
  },

  /**
   * Updates the caller's own profile.
   *
   * Only username and avatar are accepted by the server. Sending anything else
   * is not a way to change it - the service reads these two fields and ignores
   * the rest.
   */
  updateMe(input: { username?: string; avatar?: string }): Promise<SelfUser> {
    return http.patch<SelfUser>('/api/users/me', input);
  },

  profile(userId: string): Promise<UserProfile> {
    return http.get<UserProfile>(`/api/profile/${userId}`);
  },
};
