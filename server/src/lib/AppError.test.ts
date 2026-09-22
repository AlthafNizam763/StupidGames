import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ERROR_MESSAGES, ErrorCode } from '@voidline/shared';
import { AppError, errors, isAppError } from './AppError';

describe('AppError', () => {
  it('takes its HTTP status from the shared contract, not the call site', () => {
    assert.equal(new AppError(ErrorCode.ROOM_FULL).status, 409);
    assert.equal(new AppError(ErrorCode.UNAUTHENTICATED).status, 401);
    assert.equal(new AppError(ErrorCode.NOT_FOUND).status, 404);
    assert.equal(new AppError(ErrorCode.INTERNAL_ERROR).status, 500);
    assert.equal(new AppError(ErrorCode.COOLDOWN_ACTIVE).status, 429);
  });

  it('falls back to the shared default copy when no message is given', () => {
    assert.equal(new AppError(ErrorCode.ROOM_FULL).message, ERROR_MESSAGES.ROOM_FULL);
  });

  it('keeps a caller-supplied message', () => {
    assert.equal(new AppError(ErrorCode.ROOM_FULL, 'Deck Nine is full.').message, 'Deck Nine is full.');
  });

  it('classifies 5xx as a server fault and 4xx as not', () => {
    assert.equal(new AppError(ErrorCode.INTERNAL_ERROR).isServerFault, true);
    assert.equal(new AppError(ErrorCode.SERVICE_UNAVAILABLE).isServerFault, true);
    assert.equal(new AppError(ErrorCode.ROOM_FULL).isServerFault, false);
    assert.equal(new AppError(ErrorCode.VALIDATION_ERROR).isServerFault, false);
  });

  it('carries field errors for validation failures', () => {
    const error = errors.validation([{ path: 'saboteurCount', message: 'Too many.' }]);
    assert.equal(error.code, ErrorCode.VALIDATION_ERROR);
    assert.equal(error.status, 400);
    assert.deepEqual(error.fieldErrors, [{ path: 'saboteurCount', message: 'Too many.' }]);
  });

  it('keeps log context off the error message', () => {
    const error = new AppError(ErrorCode.NOT_FOUND, 'Nope.', { context: { roomId: 'abc' } });
    assert.deepEqual(error.context, { roomId: 'abc' });
    assert.equal(error.message, 'Nope.');
  });

  it('recognises its own instances', () => {
    assert.equal(isAppError(new AppError(ErrorCode.NOT_FOUND)), true);
    assert.equal(isAppError(new Error('plain')), false);
    assert.equal(isAppError('not an error'), false);
  });
});
