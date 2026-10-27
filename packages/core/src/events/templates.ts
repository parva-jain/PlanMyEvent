import type { EventTemplate, TemplateKey } from '@pme/contracts';

/**
 * Event templates (PRD "Event setup"): which modules start on, the default response mode
 * and starter sub-events. Starter tasks and budget categories join in milestone 6, when
 * their tables exist. Times are local to the event's time zone; day offsets past the
 * event's last day are clamped to it.
 */
export const EVENT_TEMPLATES: Record<TemplateKey, EventTemplate> = {
  wedding: {
    key: 'wedding',
    modules: [
      { module: 'guests', enabled: true },
      { module: 'registration', enabled: false },
      { module: 'gallery', enabled: true },
    ],
    responseMode: 'invite_only',
    subEvents: [
      { name: 'Haldi', dayOffset: 0, start: '10:00', end: '13:00' },
      { name: 'Mehendi', dayOffset: 0, start: '16:00', end: '21:00' },
      { name: 'Sangeet', dayOffset: 1, start: '19:00', end: '23:00' },
      { name: 'Wedding', dayOffset: 2, start: '17:00', end: '23:30' },
      { name: 'Reception', dayOffset: 3, start: '19:00', end: '23:00' },
    ],
  },
  conference: {
    key: 'conference',
    modules: [
      { module: 'guests', enabled: false },
      { module: 'registration', enabled: true },
      { module: 'gallery', enabled: true },
    ],
    responseMode: 'open_registration',
    subEvents: [
      { name: 'Registration and breakfast', dayOffset: 0, start: '08:30', end: '09:30' },
      { name: 'Opening keynote', dayOffset: 0, start: '09:30', end: '10:30' },
      { name: 'Sessions', dayOffset: 0, start: '11:00', end: '17:00' },
      // A large offset clamps to the last day.
      { name: 'Closing', dayOffset: 99, start: '17:00', end: '18:00' },
    ],
  },
  fair: {
    key: 'fair',
    modules: [
      { module: 'guests', enabled: false },
      { module: 'registration', enabled: true },
      { module: 'gallery', enabled: true },
    ],
    responseMode: 'open_registration',
    // One "Day N" per day of the fair; see `starterSubEvents`.
    subEvents: [{ name: 'Day {n}', dayOffset: 0, start: '10:00', end: '20:00' }],
  },
  celebration: {
    key: 'celebration',
    modules: [
      { module: 'guests', enabled: true },
      { module: 'registration', enabled: false },
      { module: 'gallery', enabled: true },
    ],
    responseMode: 'invite_rsvp',
    subEvents: [{ name: 'Celebration', dayOffset: 0, start: '18:00', end: '22:00' }],
  },
  custom: {
    key: 'custom',
    modules: [
      { module: 'guests', enabled: true },
      { module: 'registration', enabled: false },
      { module: 'gallery', enabled: false },
    ],
    responseMode: 'invite_only',
    subEvents: [],
  },
};

/** A fair gets at most this many "Day N" sub-events. */
const MAX_FAIR_DAYS = 14;

export interface StarterSubEvent {
  name: string;
  /** `YYYY-MM-DD` */
  date: string;
  start: string;
  end: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** The template's sub-events placed on the event's dates. */
export function starterSubEvents(
  template: EventTemplate,
  startsOn: string,
  endsOn: string,
): StarterSubEvent[] {
  const lastDay = daysBetween(startsOn, endsOn);
  if (template.key === 'fair') {
    const [day] = template.subEvents;
    if (!day) return [];
    return Array.from({ length: Math.min(lastDay + 1, MAX_FAIR_DAYS) }, (_, index) => ({
      name: day.name.replace('{n}', String(index + 1)),
      date: addDays(startsOn, index),
      start: day.start,
      end: day.end,
    }));
  }
  return template.subEvents.map((item) => ({
    name: item.name,
    date: addDays(startsOn, Math.min(item.dayOffset, lastDay)),
    start: item.start,
    end: item.end,
  }));
}
