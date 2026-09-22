/**
 * Localisation scaffolding.
 *
 * SCOPE, stated plainly: this is the architecture (§37), not a finished
 * translation layer. The locale is a real, persisted preference and the lookup
 * below genuinely works, but the screens still hold English literals - string
 * extraction across the app is its own pass, and doing it half-way would leave
 * a codebase where some text translates and some does not, which is worse than
 * none at all.
 *
 * What this establishes now, so that pass is mechanical later:
 *
 * - a `Locale` union and the catalogue of supported locales
 * - a flat, dotted key namespace, chosen over nested objects because a flat map
 *   is what every translation management tool imports and exports
 * - `t()` with named interpolation and a missing-key policy
 * - English as the source of truth, with other locales typed against it so a
 *   missing key is a compile error rather than a blank space in the UI
 */

export const LOCALES = {
  en: { code: 'en', label: 'English', nativeLabel: 'English' },
} as const;

export type Locale = keyof typeof LOCALES;

export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && value in LOCALES;
}

/**
 * The English catalogue, and the shape every other locale must satisfy.
 *
 * Only the keys already in use appear here. Adding a locale means adding a
 * `Record<TranslationKey, string>` typed against this, so an incomplete
 * translation fails to compile.
 */
const en = {
  'settings.title': 'Settings',
  'settings.audio': 'Audio',
  'settings.audio.master': 'Master volume',
  'settings.audio.music': 'Music',
  'settings.audio.sfx': 'Sound effects',
  'settings.audio.voice': 'Voice chat',
  'settings.gameplay': 'Gameplay',
  'settings.gameplay.vibration': 'Vibration',
  'settings.gameplay.names': 'Show player names',
  'settings.gameplay.effects': 'Visual effects',
  'settings.gameplay.reduceMotion': 'Reduce motion',
  'settings.controls': 'Controls',
  'settings.controls.sensitivity': 'Joystick sensitivity',
  'settings.controls.position': 'Joystick position',
  'settings.language': 'Language',
  'settings.reset': 'Reset to defaults',
} as const;

export type TranslationKey = keyof typeof en;

const CATALOGUES: Record<Locale, Record<TranslationKey, string>> = { en };

export type TranslationValues = Record<string, string | number>;

/**
 * Looks up a key.
 *
 * A missing key returns the key itself rather than an empty string. A visible
 * `settings.audio.master` in the interface is an obvious bug report; a blank
 * label is one nobody notices until a user asks what the empty row does.
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  values?: TranslationValues,
): string {
  const template = CATALOGUES[locale]?.[key] ?? CATALOGUES[DEFAULT_LOCALE][key] ?? key;

  if (!values) return template;

  // `{name}` placeholders. Deliberately minimal - plurals and dates need a real
  // library (Intl.PluralRules, Intl.DateTimeFormat) and are added with the
  // extraction pass, not guessed at now.
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

export const AVAILABLE_LOCALES = Object.values(LOCALES);
