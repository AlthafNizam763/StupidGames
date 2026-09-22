import { z } from 'zod';

/**
 * Input schemas for the auth endpoints.
 *
 * These are the boundary. Everything past a successful parse is trusted to have
 * this shape, which is what keeps the service layer free of defensive checks.
 */

/**
 * Usernames are the in-game identity, so they are deliberately narrow: letters,
 * digits, underscore and hyphen only.
 *
 * Allowing spaces or Unicode look-alikes would let one player register a name
 * that renders identically to another's - and in a game about working out who
 * is lying, being able to impersonate someone in the player list is not a
 * cosmetic problem.
 */
export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Must be at least 3 characters.')
  .max(16, 'Must be 16 characters or fewer.')
  .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, underscore or hyphen only.');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email address.')
  .max(254, 'That email address is too long.')
  .email('Enter a valid email address.');

/**
 * Length is the only rule.
 *
 * Composition requirements ("one uppercase, one symbol") push people toward
 * predictable substitutions and are no longer recommended by NIST. A 10
 * character minimum with a generous ceiling does more, and the ceiling exists
 * only so a megabyte-long password cannot be used to tie up the hasher.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(128, 'Use 128 characters or fewer.');

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  // Not `passwordSchema`: an existing account may predate a rule change, and
  // rejecting a sign-in for a password that is "too short" would leak that the
  // account exists.
  password: z.string().min(1, 'Enter your password.'),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'This reset link is missing its token.'),
  password: passwordSchema,
});

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
export type ForgotPasswordBody = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>;
