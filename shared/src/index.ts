/**
 * @voidline/shared - the contract between the VOIDLINE client and server.
 *
 * This package holds only the protocol: event names, payload shapes, enums,
 * error codes, tuning constants and the settings validator. It deliberately
 * contains NO game logic and NO dependencies. Game rules live on the server,
 * where they are authoritative; anything that lived here could be read - and
 * therefore reasoned around - by a modified client.
 */

export * from './errors';
export * from './constants';
export * from './types';
export * from './events';
export * from './validation';

/** Protocol version. Bump on any breaking change; the handshake checks it. */
export const PROTOCOL_VERSION = 1;
