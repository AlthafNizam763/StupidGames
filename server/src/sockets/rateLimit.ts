import { ACTION_RATE_LIMIT, SOCKET_EVENT_RATE_LIMIT } from '@voidline/shared';

/**
 * Per-socket event budgets.
 *
 * A sliding window would be more precise, but it means keeping a timestamp per
 * event per socket - real memory across hundreds of connections, to police
 * something that only needs a ceiling. A fixed window that resets is enough:
 * the worst case is a client getting up to two windows' worth of events across
 * a boundary, which is not an attack.
 *
 * The numbers come from the shared contract, so a client that paces itself to
 * the documented budget is never limited by accident.
 */

interface Window {
  count: number;
  resetAt: number;
}

export class SocketRateLimiter {
  private readonly windows = new Map<string, Window>();

  /** Returns true when the event is within budget. */
  private consume(key: string, limit: number, windowMs: number, now: number): boolean {
    const existing = this.windows.get(key);

    if (!existing || now >= existing.resetAt) {
      this.windows.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    if (existing.count >= limit) return false;

    existing.count += 1;
    return true;
  }

  /** The global ceiling: every event from this socket counts against it. */
  allowEvent(now = Date.now()): boolean {
    return this.consume('event', SOCKET_EVENT_RATE_LIMIT.events, SOCKET_EVENT_RATE_LIMIT.windowMs, now);
  }

  /** The tighter budget for gameplay actions: interact, eliminate, report, vote. */
  allowAction(now = Date.now()): boolean {
    return this.consume('action', ACTION_RATE_LIMIT.actions, ACTION_RATE_LIMIT.windowMs, now);
  }

  /** Chat is limited per channel, so one noisy channel cannot silence another. */
  allowChat(channel: string, limit: number, windowMs: number, now = Date.now()): boolean {
    return this.consume(`chat:${channel}`, limit, windowMs, now);
  }

  /** Called on disconnect. Without it the map grows for the life of the process. */
  dispose(): void {
    this.windows.clear();
  }
}
