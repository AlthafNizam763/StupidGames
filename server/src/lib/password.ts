import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing.
 *
 * argon2id, which is what SECURITY.md commits to and what OWASP currently
 * recommends: memory-hard, so a GPU farm gains far less advantage than it does
 * against bcrypt.
 *
 * `@node-rs/argon2` ships prebuilt binaries rather than compiling on install,
 * which is what makes this work on a Windows development machine without a C
 * toolchain.
 */

/**
 * OWASP's baseline for argon2id: 19 MiB of memory, 2 passes, 1 lane.
 *
 * These are a deliberate cost, not a tuning knob to turn down. Raising them
 * later is safe - the parameters are encoded in each stored hash, so old
 * hashes keep verifying and only new ones use the new cost.
 */
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, OPTIONS);
}

/**
 * Checks a password against a stored hash.
 *
 * Returns false rather than throwing on a malformed hash. A corrupt row should
 * fail the sign-in attempt, not crash the request - and the caller cannot
 * usefully distinguish "wrong password" from "unreadable hash" anyway, because
 * telling them apart is exactly what an attacker would want.
 */
export async function verifyPassword(hashed: string, plaintext: string): Promise<boolean> {
  try {
    return await verify(hashed, plaintext, OPTIONS);
  } catch {
    return false;
  }
}
