'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Locale } from '@/lib/i18n';

/**
 * Device preferences.
 *
 * These are stored in `localStorage`, not on the server, and that is the right
 * place for them: joystick sensitivity and control position describe the device
 * being played on, not the account. Somebody who plays on a phone and a desktop
 * wants different values on each, and syncing them would actively fight that.
 *
 * Nothing here is authoritative for gameplay. Turning off "show player names"
 * changes what this client draws; it cannot change what the server sends, and
 * no setting here confers any advantage.
 */

export type ControlPosition = 'left' | 'right';

export interface AudioSettings {
  /** 0-1. Master multiplies the other three. */
  master: number;
  music: number;
  sfx: number;
  voice: number;
}

export interface GameplaySettings {
  vibration: boolean;
  showPlayerNames: boolean;
  visualEffects: boolean;
  /** Mirrors the OS preference by default; can be forced on here (§46). */
  reduceMotion: boolean;
}

export interface ControlSettings {
  /** 0.5-2.0. Multiplies joystick travel. */
  joystickSensitivity: number;
  /** Which thumb holds the stick. Left-handed players are not an afterthought. */
  joystickPosition: ControlPosition;
}

interface SettingsState {
  audio: AudioSettings;
  gameplay: GameplaySettings;
  controls: ControlSettings;
  locale: Locale;

  setAudio: (patch: Partial<AudioSettings>) => void;
  setGameplay: (patch: Partial<GameplaySettings>) => void;
  setControls: (patch: Partial<ControlSettings>) => void;
  setLocale: (locale: Locale) => void;
  reset: () => void;
}

const DEFAULTS = {
  audio: { master: 0.8, music: 0.5, sfx: 0.8, voice: 1 },
  gameplay: {
    vibration: true,
    showPlayerNames: true,
    visualEffects: true,
    reduceMotion: false,
  },
  controls: { joystickSensitivity: 1, joystickPosition: 'left' as ControlPosition },
  locale: 'en' as Locale,
};

/** Keeps a slider inside its range whatever the UI or a stale stored value says. */
function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      setAudio: (patch) =>
        set((state) => ({
          audio: {
            ...state.audio,
            ...patch,
            ...(patch.master !== undefined ? { master: clamp01(patch.master) } : {}),
            ...(patch.music !== undefined ? { music: clamp01(patch.music) } : {}),
            ...(patch.sfx !== undefined ? { sfx: clamp01(patch.sfx) } : {}),
            ...(patch.voice !== undefined ? { voice: clamp01(patch.voice) } : {}),
          },
        })),

      setGameplay: (patch) => set((state) => ({ gameplay: { ...state.gameplay, ...patch } })),

      setControls: (patch) =>
        set((state) => ({
          controls: {
            ...state.controls,
            ...patch,
            ...(patch.joystickSensitivity !== undefined
              ? { joystickSensitivity: Math.min(2, Math.max(0.5, patch.joystickSensitivity)) }
              : {}),
          },
        })),

      setLocale: (locale) => set({ locale }),

      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'voidline.settings',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      /*
       * Merging rather than replacing means a settings group added in a later
       * version arrives with its defaults intact instead of `undefined`, so an
       * existing player does not have to clear storage after an update.
       */
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          ...saved,
          audio: { ...current.audio, ...saved.audio },
          gameplay: { ...current.gameplay, ...saved.gameplay },
          controls: { ...current.controls, ...saved.controls },
        };
      },
    },
  ),
);

/** The volume a sound should actually play at, once master is applied. */
export function effectiveVolume(audio: AudioSettings, channel: 'music' | 'sfx' | 'voice'): number {
  return clamp01(audio.master * audio[channel]);
}
