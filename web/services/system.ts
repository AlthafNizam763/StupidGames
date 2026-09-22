import { env } from '@/lib/env';

/**
 * Liveness check against the game server.
 *
 * `GET /health` deliberately returns no response envelope and touches no
 * database (see API.md), so this cannot go through the `http` client - and
 * should not: the point is to find out whether the server answers at all.
 */

export type UplinkStatus = 'checking' | 'online' | 'offline';

export async function checkUplink(timeoutMs = 5000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${env.apiUrl}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    // Unreachable, DNS failure, CORS rejection, timeout - all the same answer
    // to the only question being asked.
    return false;
  } finally {
    clearTimeout(timer);
  }
}
