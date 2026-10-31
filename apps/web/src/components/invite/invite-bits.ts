import type { PublicInvite } from '@pme/contracts';

type Item = PublicInvite['schedule'][number];

/** "Sat, 12 Dec · 11:00 am" in the event's own time zone, wherever the guest is. */
export function whenIn(iso: string, timeZone: string): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat('en-IN', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(date);
  const time = new Intl.DateTimeFormat('en-IN', {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
  return `${day} · ${time}`;
}

/** The venue's own map link, or a Google Maps search for its name and address. */
export function mapLink(venue: NonNullable<Item['venue']>): string {
  if (venue.mapUrl && /^https:\/\//.test(venue.mapUrl)) return venue.mapUrl;
  const query = [venue.name, venue.address].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** 2026-12-12T05:30:00.000Z → 20261212T053000Z (iCalendar UTC). */
const icsTime = (iso: string) => new Date(iso).toISOString().replace(/[-:]|\.\d{3}/g, '');

/** iCalendar text escaping: backslash, semicolon, comma and newlines. */
const icsText = (text: string) =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/**
 * Downloads an .ics with one entry per item on the program, so phones offer to add them to
 * the calendar. Built here: the link's token never goes into a calendar server's logs.
 */
export function calendarFile(eventName: string, items: readonly Item[]) {
  const stamp = icsTime(new Date().toISOString());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Plan My Event//Invitation//EN',
    'CALSCALE:GREGORIAN',
    ...items.flatMap((item) => [
      'BEGIN:VEVENT',
      `UID:${item.id}@planmyevent`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsTime(item.startsAt)}`,
      `DTEND:${icsTime(item.endsAt)}`,
      `SUMMARY:${icsText(`${item.name} · ${eventName}`)}`,
      ...(item.venue
        ? [`LOCATION:${icsText([item.venue.name, item.venue.address].filter(Boolean).join(', '))}`]
        : []),
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ];
  const url = URL.createObjectURL(
    new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `${eventName.replace(/[^\w\s-]/g, '').trim() || 'invitation'}.ics`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
