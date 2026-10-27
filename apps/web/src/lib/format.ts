/**
 * DESIGN.md "Typography": dates like "Sat, 12 Dec". Day before month regardless of the UI
 * language, like CountUp's en-IN numbers. Event dates are calendar dates (`YYYY-MM-DD`),
 * formatted in UTC so no time zone can shift the day.
 */
const parts = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "14 Nov 2026", or "Sat, 14 Nov 2026" with `weekday`. */
export function formatEventDate(isoDate: string, { weekday = false } = {}): string {
  const part = Object.fromEntries(
    parts.formatToParts(new Date(isoDate)).map(({ type, value }) => [type, value]),
  );
  const date = `${part.day} ${part.month} ${part.year}`;
  return weekday ? `${part.weekday}, ${date}` : date;
}

/** "Thu, 10 Dec 2026", or "Thu, 10 Dec – Sat, 12 Dec 2026" across days. */
export function formatEventRange(startsOn: string, endsOn: string): string {
  if (startsOn === endsOn) return formatEventDate(startsOn, { weekday: true });
  const start = formatEventDate(startsOn, { weekday: true });
  const end = formatEventDate(endsOn, { weekday: true });
  return startsOn.slice(0, 4) === endsOn.slice(0, 4)
    ? `${start.replace(/ \d{4}$/, '')} – ${end}`
    : `${start} – ${end}`;
}

/** Whole days from today (in the browser's zone) until a `YYYY-MM-DD` date. */
export function daysUntil(date: string, today = new Date()): number {
  const local = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((Date.parse(`${date}T00:00:00Z`) - local) / 86_400_000);
}

/**
 * Time zones for a picker, always including `current`: browsers list some zones under older
 * canonical names (Chrome has Asia/Calcutta, not Asia/Kolkata), and a select whose value
 * isn't an option silently shows the first one instead.
 */
export function timeZoneOptions(current: string): string[] {
  let zones: string[];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = [];
  }
  return zones.includes(current) ? zones : [current, ...zones];
}
