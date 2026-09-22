import { INPUT_SEQUENCE_MAX } from '@voidline/shared';

/**
 * Monotonic sequence checking for client input.
 *
 * Every movement packet carries a sequence number (SOCKET_EVENTS.md). Two
 * problems this solves, both of which matter once movement is networked in
 * Phase 11:
 *
 * - **Replay.** A captured packet resent later would otherwise be integrated
 *   again. Since each one only advances the player a fraction of a step,
 *   replaying a burst of them is a speed hack made of legitimate messages.
 * - **Reordering.** Transport does not guarantee order. An older packet applied
 *   after a newer one drags the player backwards.
 *
 * Built now, with the rest of the socket architecture, rather than bolted onto
 * the movement handler later.
 */

export interface SequenceCheck {
  accepted: boolean;
  /** Set when rejected, for logging and anti-cheat counters. */
  reason?: 'replay' | 'out-of-range' | 'not-a-number';
}

export class SequenceGuard {
  private last = 0;

  /**
   * Accepts a sequence only if it is strictly newer.
   *
   * Equality is rejected as well as regression: a client never legitimately
   * sends the same sequence twice, so a duplicate is either a retransmission or
   * a replay, and applying it twice is the bug either way.
   */
  check(sequence: unknown): SequenceCheck {
    if (typeof sequence !== 'number' || !Number.isFinite(sequence)) {
      return { accepted: false, reason: 'not-a-number' };
    }

    if (!Number.isInteger(sequence) || sequence < 0 || sequence > INPUT_SEQUENCE_MAX) {
      return { accepted: false, reason: 'out-of-range' };
    }

    if (sequence <= this.last) {
      return { accepted: false, reason: 'replay' };
    }

    this.last = sequence;
    return { accepted: true };
  }

  get lastAccepted(): number {
    return this.last;
  }

  /**
   * Resets the counter.
   *
   * Called when a player reconnects: their client restarts its own sequence
   * from zero, and without this every packet after a reconnect would look like
   * a replay and be dropped - a player who came back and then could not move.
   */
  reset(): void {
    this.last = 0;
  }
}
