'use client';

import type { LoginInput, RegisterInput, SelfUser } from '@voidline/shared';
import { create } from 'zustand';
import { authApi } from '@/services/auth';
import { ApiError, configureAuth } from '@/services/http';

/**
 * The signed-in session.
 *
 * The access token lives in this store and nowhere else - not in
 * `localStorage`, not in `sessionStorage`, not in a readable cookie. Anything
 * persisted to disk is readable by any script that manages to run on the page,
 * and survives long after the tab closes. In memory it dies with the tab.
 *
 * The cost is that a refresh of the page loses the access token. That is what
 * `restore()` is for: the httpOnly refresh cookie survives, so the session is
 * rebuilt from it on load. The long-lived credential stays unreadable
 * throughout (SECURITY.md).
 */

export type SessionStatus =
  /** Before `restore()` has finished. The app must not decide anything yet. */
  | 'unknown'
  | 'authenticated'
  | 'anonymous';

interface SessionState {
  status: SessionStatus;
  user: SelfUser | null;
  accessToken: string | null;

  restore: () => Promise<void>;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (user: SelfUser) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'unknown',
  user: null,
  accessToken: null,

  /**
   * Rebuilds the session on page load.
   *
   * A failure here is the normal case for a signed-out visitor, not an error
   * worth surfacing - so it resolves to `anonymous` rather than throwing.
   */
  async restore() {
    try {
      const session = await authApi.refresh();
      set({ status: 'authenticated', user: session.user, accessToken: session.accessToken });
    } catch {
      set({ status: 'anonymous', user: null, accessToken: null });
    }
  },

  async login(input) {
    const session = await authApi.login(input);
    set({ status: 'authenticated', user: session.user, accessToken: session.accessToken });
  },

  async register(input) {
    const session = await authApi.register(input);
    set({ status: 'authenticated', user: session.user, accessToken: session.accessToken });
  },

  async logout() {
    try {
      // Clears the httpOnly cookie server-side; the browser cannot do it here.
      await authApi.logout();
    } catch {
      // A failed call must not strand someone in a half-signed-in state. The
      // local session is dropped either way, and the refresh token expires.
    }
    set({ status: 'anonymous', user: null, accessToken: null });
  },

  setUser(user) {
    if (get().status === 'authenticated') set({ user });
  },
}));

/**
 * Connects the store to the HTTP client.
 *
 * The client needs the current token for its Authorization header and a way to
 * refresh after a 401. Wiring it here - rather than having the client import
 * the store - keeps `services/http.ts` free of any dependency on React state.
 *
 * Runs once at module load, before any component mounts.
 */
configureAuth({
  getAccessToken: () => useSessionStore.getState().accessToken,

  async refreshSession() {
    try {
      const session = await authApi.refresh();
      useSessionStore.setState({
        status: 'authenticated',
        user: session.user,
        accessToken: session.accessToken,
      });
      return true;
    } catch (error) {
      // The refresh token is gone or rejected: the session is genuinely over.
      if (error instanceof ApiError && error.isAuthFailure) {
        useSessionStore.setState({ status: 'anonymous', user: null, accessToken: null });
      }
      return false;
    }
  },
});
