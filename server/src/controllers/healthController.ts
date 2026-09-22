import type { Request, Response } from 'express';
import { PROTOCOL_VERSION } from '@voidline/shared';
import { config } from '../config/env';
import { databaseState, isDatabaseReady } from '../db/connect';

/**
 * Liveness and readiness.
 *
 * These are the two different questions a platform asks, and conflating them is
 * how a brief database blip turns into a restart loop:
 *
 * - **Liveness** (`/health`): is this process alive and able to answer? If this
 *   fails, restarting helps. It touches no database, by design (API.md).
 * - **Readiness** (`/health/ready`): should this instance receive traffic right
 *   now? If the database is down, no - but restarting would not help, so the
 *   process stays up and keeps retrying.
 *
 * Neither uses the response envelope. They are infrastructure endpoints, read
 * by probes rather than by the client's typed API layer.
 */

const startedAt = Date.now();

export function liveness(_req: Request, res: Response): void {
  res.status(200).json({
    status: 'ok',
    service: 'voidline-server',
    protocol: PROTOCOL_VERSION,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
  });
}

export function readiness(_req: Request, res: Response): void {
  const ready = isDatabaseReady();
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not-ready',
    database: databaseState(),
    // Useful when a deployment is half-rolled and two versions are live.
    environment: config.nodeEnv,
  });
}
