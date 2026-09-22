/**
 * Keys this client writes to `localStorage`, in one place.
 *
 * Namespaced, because an artifact origin is shared with nothing but the
 * key space of a domain is shared with everything else served from it. A bare
 * `seen` would be somebody else's `seen` one day.
 *
 * Nothing here is authoritative and nothing here is secret. These are
 * conveniences for the person at this browser: what they have already read,
 * what they last had open. Anything that must survive a device change, or
 * that another player's client needs to agree about, lives on the server.
 */
export const STORAGE_PREFIX = 'voidline:';

/** Set once the player has been through the introduction. */
export const ONBOARDING_KEY = `${STORAGE_PREFIX}onboarding-seen`;
