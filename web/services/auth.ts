import type {
  AuthSession,
  AuthTokens,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  SelfUser,
} from '@voidline/shared';
import { http } from './http';

/**
 * Auth API calls.
 *
 * The refresh token never appears here, in either direction: the server sets it
 * as an httpOnly cookie and the browser sends it back automatically because the
 * HTTP client uses `credentials: 'include'`. If a refresh token were ever
 * readable by this file, the cookie would have failed at its one job.
 */
export const authApi = {
  register(input: RegisterInput): Promise<AuthSession> {
    return http.post<AuthSession>('/api/auth/register', input, { anonymous: true });
  },

  login(input: LoginInput): Promise<AuthSession> {
    return http.post<AuthSession>('/api/auth/login', input, { anonymous: true });
  },

  /**
   * Exchanges the refresh cookie for a new access token.
   *
   * Anonymous on purpose: the access token it is replacing may well be expired,
   * and sending an expired bearer token would just produce a second failure.
   */
  refresh(): Promise<AuthSession> {
    return http.post<AuthSession>('/api/auth/refresh', undefined, { anonymous: true });
  },

  logout(): Promise<null> {
    return http.post<null>('/api/auth/logout');
  },

  me(): Promise<SelfUser> {
    return http.get<SelfUser>('/api/auth/me');
  },

  forgotPassword(input: ForgotPasswordInput): Promise<null> {
    return http.post<null>('/api/auth/forgot-password', input, { anonymous: true });
  },

  resetPassword(input: ResetPasswordInput): Promise<null> {
    return http.post<null>('/api/auth/reset-password', input, { anonymous: true });
  },
};

export type { AuthSession, AuthTokens, SelfUser };
