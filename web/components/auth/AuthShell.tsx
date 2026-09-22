import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { ROUTES } from '@/constants/routes';

/**
 * Shared frame for the sign-in, sign-up and password screens.
 *
 * A Server Component: it is static chrome around a form, so only the form
 * itself needs to reach the browser.
 *
 * The layout is a single centred column at every width. A two-column
 * "marketing panel beside the form" would need a separate mobile design and
 * earns nothing on a screen this simple (§38).
 */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main
      id="main"
      className="min-h-screen-safe flex flex-col items-center justify-center gap-8 px-safe py-10"
    >
      <Link
        href={ROUTES.splash}
        className="touch-target inline-flex items-center rounded-xl px-2"
        aria-label="VOIDLINE home"
      >
        <Logo />
      </Link>

      <section className="w-full max-w-sm animate-rise">
        <div className="rounded-2xl border border-void-700 bg-void-900 p-6 shadow-panel sm:p-7">
          <h1 className="font-display text-xl font-bold text-ink">{title}</h1>
          {description ? (
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{description}</p>
          ) : null}
          <div className="mt-6">{children}</div>
        </div>

        {footer ? <div className="mt-5 text-center text-sm text-ink-muted">{footer}</div> : null}
      </section>
    </main>
  );
}

/** Inline banner for an error that belongs to the whole form, not one field. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2.5 rounded-xl border border-alert/30 bg-alert-glow p-3"
    >
      <span aria-hidden className="mt-px font-bold text-alert">
        !
      </span>
      <p className="text-sm text-ink">{message}</p>
    </div>
  );
}

/** Inline banner for a completed action. */
export function FormSuccess({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-2.5 rounded-xl border border-signal/30 bg-signal-glow p-3"
    >
      <span aria-hidden className="mt-px font-bold text-signal">
        ✓
      </span>
      <p className="text-sm text-ink">{message}</p>
    </div>
  );
}
