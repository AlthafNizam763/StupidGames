'use client';

import { useEffect } from 'react';
import { useUiStore, type Toast, type ToastTone } from '@/stores/uiStore';
import { cn } from '@/lib/cn';

const TONES: Record<ToastTone, { border: string; accent: string; mark: string }> = {
  info: { border: 'border-void-600', accent: 'text-beacon', mark: 'i' },
  success: { border: 'border-signal/40', accent: 'text-signal', mark: '✓' },
  danger: { border: 'border-alert/40', accent: 'text-alert', mark: '!' },
};

function ToastRow({ toast }: { toast: Toast }) {
  const dismiss = useUiStore((s) => s.dismissToast);
  const tone = TONES[toast.tone];

  useEffect(() => {
    if (toast.duration <= 0) return;
    const timer = setTimeout(() => dismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, dismiss]);

  return (
    <div
      className={cn(
        'pointer-events-auto flex w-full animate-rise items-start gap-3 rounded-xl border bg-void-850 p-3.5 shadow-lift',
        tone.border,
      )}
    >
      {/* A glyph as well as colour, so the tone survives a colour deficiency. */}
      <span
        aria-hidden
        className={cn('mt-0.5 grid size-5 shrink-0 place-items-center text-sm font-bold', tone.accent)}
      >
        {tone.mark}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-sm break-words text-ink-muted">{toast.description}</p>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => dismiss(toast.id)}
        aria-label="Dismiss notification"
        className="-m-2 grid size-11 shrink-0 place-items-center rounded-lg text-ink-faint transition-colors hover:text-ink"
      >
        <span aria-hidden className="text-lg leading-none">
          ×
        </span>
      </button>
    </div>
  );
}

/**
 * Global notifications.
 *
 * Anchored to the bottom on mobile, where a thumb can reach the dismiss button,
 * and to the top-right on larger screens, where it will not cover the action
 * bar. `aria-live="polite"` announces new toasts without interrupting whatever
 * a screen reader is currently saying.
 */
export function Toaster() {
  const toasts = useUiStore((s) => s.toasts);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className={cn(
        'pointer-events-none fixed z-50 flex flex-col gap-2',
        'inset-x-0 bottom-0 px-safe pb-safe',
        'sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:w-90 sm:px-0 sm:pb-0',
      )}
    >
      {toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
