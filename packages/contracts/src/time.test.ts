import { describe, expect, it } from 'vitest';

import { utcToZonedParts, zonedTimeToUtc } from './time.js';

describe('event time zones', () => {
  it('round-trips a local time through UTC', () => {
    const instant = zonedTimeToUtc('2026-12-10', '18:30', 'Asia/Kolkata');
    expect(instant.toISOString()).toBe('2026-12-10T13:00:00.000Z');
    expect(utcToZonedParts(instant, 'Asia/Kolkata')).toEqual({ date: '2026-12-10', time: '18:30' });
  });

  it('crosses midnight correctly', () => {
    // 23:30 in Kolkata on the 10th is 18:00 UTC the same day; 02:00 on the 11th is 20:30 UTC on the 10th.
    expect(utcToZonedParts('2026-12-10T20:30:00Z', 'Asia/Kolkata')).toEqual({
      date: '2026-12-11',
      time: '02:00',
    });
  });
});
