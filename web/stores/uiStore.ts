'use client';

import { create } from 'zustand';

/**
 * Transient interface state: toasts, and the connection banner the realtime
 * layer raises from Phase 8.
 *
 * Nothing authoritative lives here. Game state arrives from the server and is
 * held by the game store; this is only what the interface itself needs to
 * remember between renders.
 */

export type ToastTone = 'info' | 'success' | 'danger';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  /** Milliseconds before auto-dismiss. 0 keeps it until dismissed. */
  duration: number;
}

interface UiState {
  toasts: Toast[];
  pushToast: (toast: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

let toastCounter = 0;

export const useUiStore = create<UiState>((set) => ({
  toasts: [],

  pushToast: ({ duration = 5000, ...toast }) => {
    const id = `toast-${++toastCounter}`;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id, duration }] }));
    return id;
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  clearToasts: () => set({ toasts: [] }),
}));

/**
 * Imperative helper for non-React callers (socket handlers, the API client).
 * Reads the store outside a component, which is safe because it only writes.
 */
export const toast = {
  info: (title: string, description?: string) =>
    useUiStore.getState().pushToast({ tone: 'info', title, description }),
  success: (title: string, description?: string) =>
    useUiStore.getState().pushToast({ tone: 'success', title, description }),
  danger: (title: string, description?: string) =>
    useUiStore.getState().pushToast({ tone: 'danger', title, description }),
};
