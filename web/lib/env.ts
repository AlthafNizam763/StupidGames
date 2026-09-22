/**
 * Client-visible configuration.
 *
 * Only `NEXT_PUBLIC_*` variables exist in the browser bundle, and they are
 * inlined at build time - so they must be read as full literal references
 * (`process.env.NEXT_PUBLIC_API_URL`), never assembled dynamically. A computed
 * key silently becomes `undefined` in the browser.
 *
 * Nothing secret belongs here. Anything on this page is readable by any player.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and set it - see DEPLOYMENT.md.`,
    );
  }
  return value.replace(/\/$/, '');
}

export const env = {
  apiUrl: required('NEXT_PUBLIC_API_URL', process.env.NEXT_PUBLIC_API_URL),
  socketUrl: required('NEXT_PUBLIC_SOCKET_URL', process.env.NEXT_PUBLIC_SOCKET_URL),
  isProduction: process.env.NODE_ENV === 'production',
} as const;
