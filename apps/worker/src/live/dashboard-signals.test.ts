import { dashboardGenerationKey, type LiveSignal } from '@pme/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardSignals, type DashboardRedis } from './dashboard-signals';
import { dashboardEventOf } from './live-publisher';

const EVENT = '01900000-0000-7000-8000-000000000001';

/** Enough of Redis for the throttle, on the fake clock; shared like Redis between workers. */
function fakeRedis() {
  const values = new Map<string, { value: string; expiresAt: number | null }>();
  const live = (key: string) => {
    const entry = values.get(key);
    if (entry?.expiresAt !== null && entry && entry.expiresAt <= Date.now()) values.delete(key);
    return values.get(key);
  };
  const redis: DashboardRedis = {
    incr: (key) => {
      const next = Number(live(key)?.value ?? 0) + 1;
      values.set(key, { value: String(next), expiresAt: live(key)?.expiresAt ?? null });
      return Promise.resolve(next);
    },
    expire: (key, seconds) => {
      const entry = live(key);
      if (entry) entry.expiresAt = Date.now() + seconds * 1000;
      return Promise.resolve(entry ? 1 : 0);
    },
    set: (key, value, _px, ms) => {
      if (live(key)) return Promise.resolve(null);
      values.set(key, { value, expiresAt: Date.now() + ms });
      return Promise.resolve('OK');
    },
    pttl: (key) => {
      const entry = live(key);
      return Promise.resolve(entry ? (entry.expiresAt ?? -1) - Date.now() : -2);
    },
  };
  return { redis, generation: () => live(dashboardGenerationKey(EVENT))?.value };
}

describe('DashboardSignals', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('bumps the generation on every change and signals once per second, then once more', async () => {
    const { redis, generation } = fakeRedis();
    const emitted: number[] = [];
    const emit = vi.fn((eventId: string) => {
      expect(eventId).toBe(EVENT);
      emitted.push(Date.now());
      return Promise.resolve();
    });
    const signals = new DashboardSignals(redis, emit, () => undefined);
    const start = Date.now();

    for (let index = 0; index < 20; index++) {
      await signals.changed(EVENT);
      await vi.advanceTimersByTimeAsync(10);
    }
    expect(generation()).toBe('20');
    expect(emitted).toEqual([start]);

    // The trailing send covers the changes after the first, once the window ends.
    await vi.advanceTimersByTimeAsync(1_000);
    expect(emitted).toEqual([start, start + 1_000]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(emitted).toHaveLength(2);
    signals.close();
  });

  it('shares the window between workers, so two of them still send one per second', async () => {
    const { redis } = fakeRedis();
    const emit = vi.fn(() => Promise.resolve());
    const first = new DashboardSignals(redis, emit, () => undefined);
    const second = new DashboardSignals(redis, emit, () => undefined);
    await first.changed(EVENT);
    await second.changed(EVENT);
    await second.changed(EVENT);
    expect(emit).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(emit).toHaveBeenCalledTimes(2);
    first.close();
    second.close();
  });

  it('lets a Redis failure reach the relay, so the row is retried', async () => {
    const { redis } = fakeRedis();
    const broken: DashboardRedis = {
      ...redis,
      incr: () => Promise.reject(new Error('Connection is closed')),
    };
    const signals = new DashboardSignals(
      broken,
      () => Promise.resolve(),
      () => undefined,
    );
    await expect(signals.changed(EVENT)).rejects.toThrow('Connection is closed');
  });
});

describe('dashboardEventOf', () => {
  const changed = (entityType: string): LiveSignal => ({
    kind: 'emit',
    room: `event:${EVENT}`,
    event: 'entity.changed',
    data: { eventId: EVENT, entityType },
  });

  it('picks changes that move dashboard numbers', () => {
    expect(dashboardEventOf(changed('task'))).toBe(EVENT);
    expect(dashboardEventOf(changed('attendance'))).toBe(EVENT);
    expect(dashboardEventOf(changed('contact'))).toBeNull();
    expect(
      dashboardEventOf({ kind: 'emit', room: 'user:x', event: 'notification.new', data: {} }),
    ).toBeNull();
    expect(dashboardEventOf({ kind: 'leave', userId: EVENT, eventId: EVENT })).toBeNull();
  });
});
