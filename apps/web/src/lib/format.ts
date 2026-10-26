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
