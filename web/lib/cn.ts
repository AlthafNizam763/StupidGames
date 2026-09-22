import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges class names, with later Tailwind utilities beating earlier ones.
 *
 * Plain `clsx` would leave `px-4 px-6` both in the string and let CSS order
 * decide the winner; `twMerge` resolves it to `px-6`. That is what makes a
 * `className` prop on a component reliably able to override its defaults.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
