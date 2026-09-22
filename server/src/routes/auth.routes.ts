import { Router } from 'express';
import {
  forgotPassword,
  login,
  logout,
  me,
  refresh,
  register,
  resetPassword,
} from '../controllers/authController';
import { authLimiter } from '../middleware/rateLimit';
import { requireAuth } from '../middleware/requireAuth';
import { validateBody } from '../middleware/validate';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../validation/authSchemas';

/**
 * Auth routes.
 *
 * `authLimiter` (10/minute per IP) guards every credential-accepting endpoint.
 * Without it, the sign-in route is an offline password list replayed online,
 * and the reset route is a way to spam somebody's inbox.
 *
 * `/me` is exempt: it takes no credentials, it is called on every page load to
 * restore a session, and throttling it would break normal use.
 */
export const authRouter: Router = Router();

authRouter.post('/register', authLimiter, validateBody(registerSchema), register);
authRouter.post('/login', authLimiter, validateBody(loginSchema), login);

// Not rate-limited as tightly: a client refreshes on a timer, and a stale
// refresh token fails on its own without costing a password comparison.
authRouter.post('/refresh', refresh);
authRouter.post('/logout', logout);

authRouter.get('/me', requireAuth, me);

authRouter.post(
  '/forgot-password',
  authLimiter,
  validateBody(forgotPasswordSchema),
  forgotPassword,
);
authRouter.post('/reset-password', authLimiter, validateBody(resetPasswordSchema), resetPassword);
