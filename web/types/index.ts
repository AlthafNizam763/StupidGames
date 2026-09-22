/**
 * Client-side types.
 *
 * Anything that crosses the wire is re-exported from `@voidline/shared` rather
 * than redeclared here - a second definition of a payload is a desync waiting
 * to happen. This file is for types that exist only in the browser.
 */
export type * from '@voidline/shared';
