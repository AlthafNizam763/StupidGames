'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { ROUTES } from '@/constants/routes';

/**
 * Header for a secondary screen: back control, title, optional action.
 *
 * Back uses `router.back()` when there is history to return to and falls back
 * to Home otherwise, so arriving here from a pasted link or a refresh does not
 * leave the control doing nothing.
 */
export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  const router = useRouter();

  function goBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push(ROUTES.home);
    }
  }

  return (
    <header className="flex items-center gap-2 py-2">
      <button
        type="button"
        onClick={goBack}
        aria-label="Go back"
        className="touch-target -ml-2 grid shrink-0 place-items-center rounded-xl text-ink-muted transition-colors hover:bg-void-800 hover:text-ink"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden className="size-5">
          <path
            d="M15 18l-6-6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <h1 className="min-w-0 flex-1 truncate font-display text-lg font-bold text-ink">{title}</h1>

      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
