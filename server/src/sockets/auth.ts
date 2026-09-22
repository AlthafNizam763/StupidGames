import type { Socket } from 'socket.io';
import { ErrorCode, SOCKET_AUTH_TOKEN_KEY } from '@voidline/shared';
import { AppError } from '../lib/AppError';
import { verifyAccessToken } from '../lib/tokens';
import { userRepository } from '../repositories/UserRepository';

/**
 * Socket handshake authentication.
 *
 * The token is supplied in the handshake, not as an event, so an unverified
 * socket never reaches a handler. Identity lands on `socket.data` and every
 * handler reads it from there - a `userId` in a payload is ignored, always,
 * because that is the field an attacker controls.
 *
 * The account is loaded once here rather than on every event. A disabled player
 * cannot open a new connection; an existing one is cut at the next refresh,
 * which is a deliberate trade against a database read per message.
 */
export async function authenticateSocket(socket: Socket): Promise<void> {
  const token = socket.handshake.auth?.[SOCKET_AUTH_TOKEN_KEY] as unknown;

  if (typeof token !== 'string' || !token) {
    throw new AppError(ErrorCode.UNAUTHENTICATED, 'No token supplied with the connection.');
  }

  // Throws TOKEN_EXPIRED or TOKEN_INVALID, which the client acts on
  // differently: expired means refresh and reconnect.
  const payload = verifyAccessToken(token);

  const user = await userRepository.findById(payload.sub);
  if (!user) throw new AppError(ErrorCode.TOKEN_INVALID);
  if (user.disabled) throw new AppError(ErrorCode.ACCOUNT_DISABLED);

  socket.data.userId = user.id as string;
  socket.data.username = user.username;
  socket.data.roomId = null;
  socket.data.roomCode = null;
  socket.data.lastInputSequence = 0;
}
