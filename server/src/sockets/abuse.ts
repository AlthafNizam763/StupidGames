import { MOVEMENT_INPUT_HZ } from '@voidline/shared';
import { logger } from '../lib/logger';

/**
 * Per-socket abuse tracking (§30).
 *
 * Two gaps this closes, both introduced by earlier decisions that were right in
 * themselves:
 *
 * 1. **Movement bypasses the event limiter.** `player:move` is deliberately
 *    outside the acknowledged-handler wrapper, because an ack per input at 15Hz
 *    costs more than the input is worth. The consequence was that it also
 *    escaped the rate limiter - so a client could send ten thousand a second.
 *    The server would clamp each one's *effect*, but it would still parse and
 *    process them all, which is a denial of service made of valid messages.
 *
 * 2. **Nothing counted rejections.** Individually, a rejected action is normal:
 *    players click at the wrong moment, and latency means a kill can arrive a
 *    tick after a meeting opened. Sustained rejection is not normal, and
 *    without a counter there was no way to tell the two apart.
 *
 * The response to sustained abuse is disconnection, not a ban. A modified
 * client is usually a curious player, the seat survives the reconnect grace
 * period, and a ban list is a thing that needs appeals.
 */

/**
 * Movement budget, with headroom.
 *
 * The client paces itself to `MOVEMENT_INPUT_HZ` from the shared contract. The
 * allowance is triple that, because a client that stalls and then catches up
 * legitimately sends a burst - and a limiter that punishes a hiccup would
 * disconnect players on bad wifi rather than cheaters.
 */
const MOVEMENT_BUDGET = MOVEMENT_INPUT_HZ * 3;
const MOVEMENT_WINDOW_MS = 1000;

/**
 * Rejected actions tolerated before a socket is dropped.
 *
 * High enough that a laggy player firing at a closing window never reaches it;
 * low enough that a script probing for an unguarded action does.
 */
const REJECTION_LIMIT = 40;
const REJECTION_WINDOW_MS = 10_000;

export interface AbuseVerdict {
  allowed: boolean;
  /** True when this socket should be disconnected. */
  disconnect: boolean;
}

export class AbuseTracker {
  private movementCount = 0;
  private movementResetAt = 0;

  private rejections = 0;
  private rejectionResetAt = 0;

  /** Rejections by error code, for the log line when a socket is dropped. */
  private readonly reasons = new Map<string, number>();

  constructor(
    private readonly userId: string,
    private readonly socketId: string,
  ) {}

  /** Whether to process a movement input. */
  allowMovement(now = Date.now()): boolean {
    if (now >= this.movementResetAt) {
      this.movementCount = 1;
      this.movementResetAt = now + MOVEMENT_WINDOW_MS;
      return true;
    }

    if (this.movementCount >= MOVEMENT_BUDGET) {
      // Dropped silently. Movement has no acknowledgement, so there is nothing
      // to tell the client - and a well-behaved one is never near this.
      return false;
    }

    this.movementCount += 1;
    return true;
  }

  /**
   * Records a rejected action.
   *
   * Returns true when the socket has rejected too often and should be dropped.
   */
  recordRejection(code: string, now = Date.now()): boolean {
    if (now >= this.rejectionResetAt) {
      this.rejections = 0;
      this.rejectionResetAt = now + REJECTION_WINDOW_MS;
      this.reasons.clear();
    }

    this.rejections += 1;
    this.reasons.set(code, (this.reasons.get(code) ?? 0) + 1);

    if (this.rejections < REJECTION_LIMIT) return false;

    logger.warn(
      {
        userId: this.userId,
        socketId: this.socketId,
        rejections: this.rejections,
        reasons: Object.fromEntries(this.reasons),
      },
      'disconnecting a socket for sustained rejected actions',
    );

    return true;
  }

  /** Cleared on disconnect, so the maps do not outlive the socket. */
  dispose(): void {
    this.reasons.clear();
  }
}
