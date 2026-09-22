import type { Request, Response } from 'express';
import { created, ok, okEmpty } from '../lib/respond';
import { currentUser } from '../middleware/requireAuth';
import { validated } from '../middleware/validate';
import { roomService } from '../services/roomService';

export async function createRoom(req: Request, res: Response): Promise<void> {
  const { userId } = currentUser(req);
  created(res, await roomService.create(userId, req.body), 'Room created.');
}

export async function joinRoom(req: Request, res: Response): Promise<void> {
  const { userId } = currentUser(req);
  const summary = await roomService.checkJoinable(userId, req.body.code);
  // "You may join" - not "you have joined". The seat is taken over the socket.
  ok(res, summary, 'Room found.');
}

export async function previewRoom(_req: Request, res: Response): Promise<void> {
  const { code } = validated<{ code: string }>(res, 'params');
  ok(res, await roomService.preview(code), 'OK');
}

export async function getRoom(req: Request, res: Response): Promise<void> {
  const { userId } = currentUser(req);
  const { id } = validated<{ id: string }>(res, 'params');
  ok(res, await roomService.getState(userId, id), 'OK');
}

export async function updateRoom(req: Request, res: Response): Promise<void> {
  const { userId } = currentUser(req);
  const { id } = validated<{ id: string }>(res, 'params');
  ok(res, await roomService.updateSettings(userId, id, req.body), 'Settings updated.');
}

export async function closeRoom(req: Request, res: Response): Promise<void> {
  const { userId } = currentUser(req);
  const { id } = validated<{ id: string }>(res, 'params');
  await roomService.close(userId, id);
  okEmpty(res, 'Room closed.');
}
