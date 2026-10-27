import type { EventTemplate } from './events.js';

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

/**
 * The template's sub-events placed on the event's dates: day offsets past the last day are
 * clamped to it, and a fair gets one "Day N" per date. Shared by the API (which creates
 * them) and the web wizard (which previews them).
 */
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
