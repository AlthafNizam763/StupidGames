import type { Namespace as SocketNamespace } from 'socket.io';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '@voidline/shared';

/**
 * The typed namespace, in one place.
 *
 * Socket.IO's `Namespace` takes four type parameters and every file that
 * touches it would otherwise repeat them - and get one wrong eventually, which
 * silently weakens the typing that makes the event contract worth having.
 */
export type Namespace = SocketNamespace<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export { GamePhase, SERVER_EVENT } from '@voidline/shared';
