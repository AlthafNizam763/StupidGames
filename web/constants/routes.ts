/**
 * Every route in the client, in one place, so a rename is a single edit and a
 * typo is a compile error rather than a 404 nobody notices until QA.
 */
export const ROUTES = {
  splash: '/',
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  home: '/home',
  profile: '/profile',
  rooms: '/rooms',
  createRoom: '/rooms/create',
  joinRoom: '/rooms/join',
  lobby: (code: string) => `/lobby/${code}`,
  game: (code: string) => `/game/${code}`,
  leaderboard: '/leaderboard',
  settings: '/settings',
} as const;

/** Routes reachable without a session. Everything else requires one. */
export const PUBLIC_ROUTES: readonly string[] = [
  ROUTES.splash,
  ROUTES.login,
  ROUTES.register,
  ROUTES.forgotPassword,
];
