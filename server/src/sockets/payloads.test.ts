import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ErrorCode } from '@voidline/shared';
import { AppError } from '../lib/AppError';
import { joinRoomPayload, kickPayload, parsePayload, readyPayload, settingsPayload } from './payloads';
import { SequenceGuard } from './sequence';

function expectRejected(schema: Parameters<typeof parsePayload>[0], value: unknown): AppError {
  try {
    parsePayload(schema, value);
  } catch (error) {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, ErrorCode.VALIDATION_ERROR);
    return error;
  }
  assert.fail(`expected rejection of ${JSON.stringify(value)}`);
}

describe('socket payload validation', () => {
  describe('room:join', () => {
    it('accepts a valid code and normalises it', () => {
      assert.deepEqual(parsePayload(joinRoomPayload, { code: ' abc123 ' }), { code: 'ABC123' });
    });

    it('rejects a wrong-length code', () => {
      expectRejected(joinRoomPayload, { code: 'ABC' });
      expectRejected(joinRoomPayload, { code: 'ABCDEFGH' });
    });

    it('rejects a missing payload', () => {
      expectRejected(joinRoomPayload, undefined);
      expectRejected(joinRoomPayload, {});
    });

    it('rejects an object where a string belongs', () => {
      // The shape a Mongo operator injection arrives in. Over REST the operator
      // guard would catch it; a socket payload has no such stage in front of it.
      expectRejected(joinRoomPayload, { code: { $ne: null } });
    });

    it('rejects a number', () => {
      expectRejected(joinRoomPayload, { code: 123456 });
    });

    it('strips unknown keys rather than passing them through', () => {
      const parsed = parsePayload(joinRoomPayload, { code: 'ABC123', isAdmin: true });
      assert.equal('isAdmin' in parsed, false);
    });
  });

  describe('room:ready', () => {
    it('accepts a boolean', () => {
      assert.deepEqual(parsePayload(readyPayload, { ready: true }), { ready: true });
    });

    it('rejects a truthy non-boolean', () => {
      // No coercion: "false" is a string and would be truthy, which is exactly
      // the bug a permissive schema introduces.
      expectRejected(readyPayload, { ready: 'false' });
      expectRejected(readyPayload, { ready: 1 });
    });
  });

  describe('room:kick', () => {
    it('accepts a well-formed object id', () => {
      const id = '0123456789abcdef01234567';
      assert.deepEqual(parsePayload(kickPayload, { userId: id }), { userId: id });
    });

    it('rejects anything that is not an object id', () => {
      expectRejected(kickPayload, { userId: 'not-an-id' });
      expectRejected(kickPayload, { userId: '' });
      expectRejected(kickPayload, { userId: { $gt: '' } });
    });
  });

  describe('room:settings', () => {
    it('accepts a partial patch', () => {
      assert.deepEqual(parsePayload(settingsPayload, { discussionTime: 60 }), {
        discussionTime: 60,
      });
    });

    it('accepts an empty patch', () => {
      assert.deepEqual(parsePayload(settingsPayload, {}), {});
    });

    it('rejects a value outside its documented bounds', () => {
      expectRejected(settingsPayload, { maxPlayers: 99 });
      expectRejected(settingsPayload, { discussionTime: 1 });
      expectRejected(settingsPayload, { saboteurCount: 0 });
    });

    it('rejects a fractional value', () => {
      expectRejected(settingsPayload, { maxPlayers: 6.5 });
    });

    it('rejects an unknown setting instead of ignoring it', () => {
      // Strict, not strip. A host sending an unknown key is on a modified or
      // mismatched client, and silently dropping it would leave them believing
      // a setting applied.
      expectRejected(settingsPayload, { godMode: true });
    });

    it('rejects an attempt to smuggle in a different field type', () => {
      expectRejected(settingsPayload, { anonymousVoting: 'yes' });
    });
  });
});

describe('SequenceGuard', () => {
  it('accepts a strictly increasing sequence', () => {
    const guard = new SequenceGuard();
    assert.equal(guard.check(1).accepted, true);
    assert.equal(guard.check(2).accepted, true);
    assert.equal(guard.check(100).accepted, true);
  });

  it('rejects a repeated sequence as a replay', () => {
    const guard = new SequenceGuard();
    guard.check(5);
    const result = guard.check(5);
    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'replay');
  });

  it('rejects an older sequence arriving late', () => {
    const guard = new SequenceGuard();
    guard.check(10);
    // Applying this would drag the player backwards.
    assert.equal(guard.check(9).accepted, false);
  });

  it('rejects values that are not integers in range', () => {
    const guard = new SequenceGuard();
    assert.equal(guard.check('3').reason, 'not-a-number');
    assert.equal(guard.check(NaN).reason, 'not-a-number');
    assert.equal(guard.check(Infinity).reason, 'not-a-number');
    assert.equal(guard.check(1.5).reason, 'out-of-range');
    assert.equal(guard.check(-1).reason, 'out-of-range');
    assert.equal(guard.check(2 ** 31).reason, 'out-of-range');
  });

  it('does not advance on a rejected value', () => {
    const guard = new SequenceGuard();
    guard.check(5);
    guard.check(99999.5);
    assert.equal(guard.lastAccepted, 5);
    assert.equal(guard.check(6).accepted, true);
  });

  it('starts over after a reconnect', () => {
    const guard = new SequenceGuard();
    guard.check(500);

    // A reconnecting client restarts its own counter at zero. Without a reset,
    // every packet afterwards looks like a replay and the player cannot move.
    guard.reset();
    assert.equal(guard.check(1).accepted, true);
  });
});
