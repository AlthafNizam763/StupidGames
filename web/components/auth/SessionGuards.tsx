'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { LogoMark } from '@/components/brand/Logo';
import { ROUTES } from '@/constants/routes';
import { useSessionStore } from '@/stores/sessionStore';

/**
 * Route guards.
 *
 * These are a *convenience*, not a security control. Everything they protect is
 * already protected on the server, which is the only place it can be - a guard
 * that runs in the browser can be removed by anyone who opens devtools. Their
 * job is to spare a signed-out visitor a screen full of failed requests.
 */

function Waiting({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-screen-safe flex flex-col items-center justify-center gap-4"
    >
      <LogoMark className="size-12 animate-pulse-soft text-signal" />
      <span className="sr-only">{label}</span>
      <span aria-hidden className="text-xs tracking-[0.3em] text-ink-faint uppercase">
        {label}
      </span>
    </div>
  );
}

/** Wraps a screen that requires a session. */
export function RequireSession({ children }: { children: ReactNode }) {
  const status = useSessionStore((s) => s.status);
  const router = useRouter();

  useEffect(() => {
    if (status === 'anonymous') router.replace(ROUTES.login);
  }, [status, router]);

  // `unknown` means the restore is still in flight. Rendering the sign-in
  // redirect now would bounce a signed-in player out of their own session.
  if (status !== 'authenticated') {
    return <Waiting label={status === 'unknown' ? 'Restoring session' : 'Redirecting'} />;
  }

  return <>{children}</>;
}

/** Wraps a sign-in or sign-up screen, which a signed-in player has no use for. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const status = useSessionStore((s) => s.status);
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') router.replace(ROUTES.home);
  }, [status, router]);

  if (status === 'unknown') return <Waiting label="Checking session" />;
  if (status === 'authenticated') return <Waiting label="Signing you in" />;

  return <>{children}</>;
}
