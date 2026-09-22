import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Response } from 'express';
import { ErrorCode } from '@voidline/shared';
import { created, fail, ok, okEmpty } from './respond';

/** Minimal stand-in for an Express response: records status and JSON body. */
function mockResponse() {
  const record = { status: 0, body: undefined as unknown };
  const res = {
    status(code: number) {
      record.status = code;
      return this;
    },
    json(payload: unknown) {
      record.body = payload;
      return this;
    },
  } as unknown as Response;
  return { res, record };
}

describe('response envelope', () => {
  it('wraps success in the documented shape', () => {
    const { res, record } = mockResponse();
    ok(res, { id: 'u1' }, 'Signed in.');

    assert.equal(record.status, 200);
    assert.deepEqual(record.body, {
      success: true,
      message: 'Signed in.',
      code: null,
      data: { id: 'u1' },
    });
  });

  it('uses 201 for created resources', () => {
    const { res, record } = mockResponse();
    created(res, { id: 'r1' });
    assert.equal(record.status, 201);
  });

  it('sends null data rather than omitting the key', () => {
    const { res, record } = mockResponse();
    okEmpty(res);
    // The client's envelope type expects `data` to exist on every success.
    assert.deepEqual(record.body, { success: true, message: 'OK', code: null, data: null });
  });

  it('wraps failure with a machine-readable code', () => {
    const { res, record } = mockResponse();
    fail(res, 409, ErrorCode.ROOM_FULL, 'Room is full.');

    assert.deepEqual(record.body, {
      success: false,
      message: 'Room is full.',
      code: 'ROOM_FULL',
      data: null,
    });
  });

  it('omits `errors` entirely when there are no field errors', () => {
    const { res, record } = mockResponse();
    fail(res, 409, ErrorCode.ROOM_FULL, 'Room is full.', []);
    // Presence of `errors` is how a client detects a validation failure, so an
    // empty array would be a false positive.
    assert.equal(Object.hasOwn(record.body as object, 'errors'), false);
  });

  it('includes field errors when there are some', () => {
    const { res, record } = mockResponse();
    fail(res, 400, ErrorCode.VALIDATION_ERROR, 'Invalid.', [
      { path: 'maxPlayers', message: 'Must be between 4 and 15.' },
    ]);

    assert.deepEqual((record.body as { errors: unknown }).errors, [
      { path: 'maxPlayers', message: 'Must be between 4 and 15.' },
    ]);
  });
});
