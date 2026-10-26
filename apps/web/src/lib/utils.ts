import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge must know our custom theme names, or it would read `text-h1` as a colour
 * and drop it next to `text-fg` (and similarly for radii and shadows).
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'display',
        'display-phone',
        'h1',
        'h1-phone',
        'h2',
        'h3',
        'body-lg',
        'body',
        'label',
        'small',
        'caption',
      ],
      radius: ['control', 'card', 'dialog', 'sheet'],
      shadow: ['card', 'raised'],
    },
  },
});

/** Joins class names and resolves Tailwind conflicts (last one wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
