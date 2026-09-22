'use client';

import { useCallback } from 'react';
import { translate, type TranslationKey, type TranslationValues } from '@/lib/i18n';
import { useSettingsStore } from '@/stores/settingsStore';

/**
 * Reads the player's chosen locale and returns a bound `t()`.
 *
 * Subscribing to the locale means a language change re-renders every screen
 * using this hook, with no reload.
 */
export function useTranslation() {
  const locale = useSettingsStore((s) => s.locale);

  const t = useCallback(
    (key: TranslationKey, values?: TranslationValues) => translate(locale, key, values),
    [locale],
  );

  return { t, locale };
}
