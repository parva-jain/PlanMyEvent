/**
 * Converts a local date and time in an IANA time zone to a UTC instant, with Intl only
 * (CLAUDE.md rule 5: store UTC, each event has one time zone). Handles DST zones: the
 * offset is read at the guessed instant and corrected once.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute);
  const first = asIfUtc - offsetMs(asIfUtc, timeZone);
  return new Date(asIfUtc - offsetMs(first, timeZone));
}

/** The zone's offset from UTC at an instant, in ms (positive east of Greenwich). */
function offsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const local = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return local - Math.floor(instant / 1000) * 1000;
}

/**
 * The calendar date and 24-hour time of an instant in a time zone, e.g. for editing a
 * sub-event's start in the event's own zone: `{ date: '2026-12-10', time: '10:00' }`.
 */
export function utcToZonedParts(
  instant: Date | string,
  timeZone: string,
): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}
