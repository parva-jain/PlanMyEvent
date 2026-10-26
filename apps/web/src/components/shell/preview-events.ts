/**
 * Sample events for the shell until milestone 3 creates real ones through the API.
 * Names follow DESIGN.md "Example content" so no screen looks wedding-only.
 */
export type EventType = 'wedding' | 'conference' | 'collegeFest' | 'fair' | 'celebration';

export interface PreviewEvent {
  id: string;
  name: string;
  type: EventType;
  /** ISO date of the first day, in the event's time zone. */
  startsOn: string;
  city: string;
}

export const PREVIEW_EVENTS: PreviewEvent[] = [
  {
    id: 'devfest',
    name: 'DevFest Bhopal 2026',
    type: 'conference',
    startsOn: '2026-11-14',
    city: 'Bhopal',
  },
  {
    id: 'sharma',
    name: 'Sharma Wedding',
    type: 'wedding',
    startsOn: '2026-12-12',
    city: 'Jaipur',
  },
  {
    id: 'technofest',
    name: 'Techno Fest 2026',
    type: 'collegeFest',
    startsOn: '2027-02-05',
    city: 'Indore',
  },
  {
    id: 'craftfair',
    name: 'Indore Craft Fair',
    type: 'fair',
    startsOn: '2027-01-16',
    city: 'Indore',
  },
];

/** Event accent classes (DESIGN.md "Event accents"); spelled out so Tailwind finds them. */
export const ACCENT: Record<EventType, { bg: string; tint: string; text: string }> = {
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
  collegeFest: {
    bg: 'bg-event-custom',
    tint: 'bg-event-custom-tint',
    text: 'text-event-custom-text',
  },
  fair: { bg: 'bg-event-fair', tint: 'bg-event-fair-tint', text: 'text-event-fair-text' },
  celebration: {
    bg: 'bg-event-celebration',
    tint: 'bg-event-celebration-tint',
    text: 'text-event-celebration-text',
  },
};
