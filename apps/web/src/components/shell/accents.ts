import type { Event } from '@pme/contracts';

/** Event accent classes (DESIGN.md "Event accents"); spelled out so Tailwind finds them. */
export const ACCENT: Record<Event['type'], { bg: string; tint: string; text: string }> = {
  wedding: {
    bg: 'bg-event-wedding',
    tint: 'bg-event-wedding-tint',
    text: 'text-event-wedding-text',
  },
  conference: {
    bg: 'bg-event-conference',
    tint: 'bg-event-conference-tint',
    text: 'text-event-conference-text',
  },
  fair: { bg: 'bg-event-fair', tint: 'bg-event-fair-tint', text: 'text-event-fair-text' },
  celebration: {
    bg: 'bg-event-celebration',
    tint: 'bg-event-celebration-tint',
    text: 'text-event-celebration-text',
  },
  custom: { bg: 'bg-event-custom', tint: 'bg-event-custom-tint', text: 'text-event-custom-text' },
};

/** Accent hex per type, for confetti (DESIGN.md "Event accents"). */
export const ACCENT_HEX: Record<Event['type'], string> = {
  wedding: '#E11D74',
  conference: '#2563EB',
  fair: '#0D9488',
  celebration: '#EA580C',
  custom: '#7C3AED',
};
