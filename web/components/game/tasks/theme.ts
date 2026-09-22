import { TaskType } from '@voidline/shared';

/**
 * Per-objective identity.
 *
 * Seven objectives share three interaction shapes, so without this they would
 * be three mini-games wearing seven names. Reactor Calibration and Oxygen
 * Balancing are both ALIGN, and a player should still know instantly which
 * one they are looking at - the panel they open in Reactor should not be the
 * panel they open in Hydroponics with a different heading.
 *
 * Each carries an accent, a short instruction in the objective's own language,
 * and the unit its numbers are read in. Nothing here affects what is sent: the
 * wire values are plain integers and the server neither knows nor cares that
 * one screen calls them hertz and another calls them degrees.
 */

export interface TaskTheme {
  /** A Tailwind colour token name from the design system. */
  accent: 'signal' | 'caution' | 'beacon' | 'alert';
  /** What the player is being asked to do, in the objective's own words. */
  instruction: string;
  /**
   * The instruction, when the puzzle carries a `reference` threshold.
   *
   * Written with the real number in it rather than gesturing at "the
   * qualifying ones". The server verifies "at or above reference", so the
   * sentence the player reads states exactly the condition that will be
   * checked - the rule and its verification cannot drift apart if there is
   * only one statement of it.
   */
  rule?: (reference: number) => string;
  /** Suffix for the numbers on screen. Presentation only. */
  unit: string;
  /** Word for one of the things being manipulated. */
  noun: string;
  /**
   * Its plural, written out.
   *
   * Not `noun + 's'`, which rendered the Security Scan pool as "ENTRYS".
   * English plurals are not a string operation, and there are seven of these.
   */
  nounPlural: string;
}

export const TASK_THEME: Readonly<Record<TaskType, TaskTheme>> = {
  [TaskType.REACTOR_CALIBRATION]: {
    accent: 'caution',
    instruction: 'Bring every rod to its marked depth.',
    unit: '%',
    noun: 'Rod',
    nounPlural: 'Rods',
  },
  [TaskType.OXYGEN_BALANCING]: {
    accent: 'signal',
    instruction: 'Set each valve to the pressure shown.',
    unit: 'kPa',
    noun: 'Valve',
    nounPlural: 'Valves',
  },
  [TaskType.POWER_SYNCHRONIZATION]: {
    accent: 'caution',
    instruction: 'Match each generator to the reference phase.',
    unit: 'Hz',
    noun: 'Generator',
    nounPlural: 'Generators',
  },
  [TaskType.NAVIGATION_CALIBRATION]: {
    accent: 'beacon',
    instruction: 'Align the plot to the marked bearing.',
    unit: '°',
    noun: 'Axis',
    nounPlural: 'Axes',
  },
  [TaskType.SIGNAL_ROUTING]: {
    accent: 'beacon',
    instruction: 'Route the signal through the channels, lowest first.',
    unit: '',
    noun: 'Channel',
    nounPlural: 'Channels',
  },
  [TaskType.DATA_RECOVERY]: {
    accent: 'signal',
    instruction: 'Restore the blocks in ascending order.',
    unit: '',
    noun: 'Block',
    nounPlural: 'Blocks',
  },
  [TaskType.SECURITY_SCAN]: {
    accent: 'alert',
    instruction: 'Flag the entries that match the scan reference.',
    rule: (reference) => `Flag every entry reading ${reference} or higher.`,
    unit: '',
    noun: 'Entry',
    nounPlural: 'Entries',
  },
};

/**
 * Accent classes, written out rather than interpolated.
 *
 * Tailwind scans source text for class names, so `text-${accent}` produces a
 * class that exists in the markup and not in the stylesheet - it works in
 * development and silently loses its colour in a production build.
 */
export const ACCENT_CLASS: Readonly<
  Record<TaskTheme['accent'], { text: string; bg: string; border: string; fill: string }>
> = {
  signal: {
    text: 'text-signal',
    bg: 'bg-signal-glow',
    border: 'border-signal',
    fill: 'bg-signal',
  },
  caution: {
    text: 'text-caution',
    bg: 'bg-caution/10',
    border: 'border-caution',
    fill: 'bg-caution',
  },
  beacon: {
    text: 'text-beacon',
    bg: 'bg-beacon/10',
    border: 'border-beacon',
    fill: 'bg-beacon',
  },
  alert: {
    text: 'text-alert',
    bg: 'bg-alert-glow',
    border: 'border-alert',
    fill: 'bg-alert',
  },
};
