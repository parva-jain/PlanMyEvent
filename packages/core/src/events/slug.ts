import { randomInt } from 'node:crypto';

const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const MAX_BASE = 50;

/** Public URL slug, `/e/<slug>`: lowercase words from the name plus a short random suffix. */
export function eventSlug(name: string): string {
  const base =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_BASE)
      .replace(/-+$/, '') || 'event';
  const suffix = Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `${base}-${suffix}`;
}

/** DatabaseDesign: lowercase, 3-60 characters. */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;
