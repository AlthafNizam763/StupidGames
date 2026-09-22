import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { ErrorCode } from '@voidline/shared';
import { AppError } from '../lib/AppError';
import { rejectMongoOperators } from './sanitize';

/**
 * These payloads are the actual shapes an injection attempt takes: an object
 * where the schema expects a string, carrying an operator that turns a lookup
 * into a match-anything query.
 */

function run(body: unknown): AppError | null {
  const req = { body, query: {}, params: {}, originalUrl: '/api/test' } as unknown as Request;
  let captured: unknown = null;
  const next: NextFunction = (error?: unknown) => {
    captured = error ?? null;
  };

  rejectMongoOperators(req, {} as Response, next);
  return captured instanceof AppError ? captured : null;
}

describe('rejectMongoOperators', () => {
  it('passes an ordinary payload through', () => {
    assert.equal(run({ email: 'crew@voidline.test', password: 'hunter2' }), null);
  });

  it('allows values that merely contain a dollar sign', () => {
    // Only *keys* are operators. A password of "$ecret" is perfectly legal.
    assert.equal(run({ password: '$ecret', note: 'costs $5' }), null);
  });

  it('rejects an operator used to bypass a lookup', () => {
    const error = run({ email: { $ne: null } });
    assert.ok(error, 'expected the request to be rejected');
    assert.equal(error.code, ErrorCode.VALIDATION_ERROR);
    assert.equal(error.status, 400);
    assert.equal(error.context?.suspectKey, '$ne');
  });

  it('rejects an operator nested deeper in the body', () => {
    const error = run({ filter: { user: { name: { $regex: '.*' } } } });
    assert.ok(error);
    assert.equal(error.context?.suspectKey, '$regex');
  });

  it('rejects an operator hidden inside an array', () => {
    const error = run({ ids: [{ $gt: '' }] });
    assert.ok(error);
    assert.equal(error.context?.suspectKey, '$gt');
  });

  it('rejects a dotted key used to traverse a document path', () => {
    const error = run({ 'stats.matchesWon': 9999 });
    assert.ok(error);
    assert.equal(error.context?.suspectKey, 'stats.matchesWon');
  });

  it('does not recurse forever on a self-referencing object', () => {
    const cyclic: Record<string, unknown> = { safe: true };
    cyclic.self = cyclic;
    // Passes because the depth cap stops the walk, not because it is verified
    // clean - Zod is what actually guarantees the shape downstream.
    assert.doesNotThrow(() => run(cyclic));
  });

  it('tolerates a body that is not an object', () => {
    assert.equal(run(undefined), null);
    assert.equal(run('a string'), null);
    assert.equal(run(null), null);
  });
});
