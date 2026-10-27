import { zonedTimeToUtc } from '@pme/contracts';
import { describe, expect, it } from 'vitest';

import { runAction } from '../action.js';
import type { ActionContext } from '../context.js';
import { memoryRuntime } from '../testing/memory-tx.js';
import { createEvent, replaceModules, updateEvent } from './event-actions.js';
import {
  createSubEvent,
  createVenue,
  deleteSubEvent,
  deleteVenue,
  updateSubEvent,
} from './program-actions.js';
import { eventSlug, SLUG_PATTERN } from './slug.js';
import { EVENT_TEMPLATES, starterSubEvents } from './templates.js';

const userCtx: ActionContext = {
  requestId: 'req_test',
  channel: 'app',
  actor: { kind: 'user', userId: 'u1', memberId: null },
  eventId: null,
  now: new Date('2026-10-27T00:00:00Z'),
};

async function withEvent(templateKey: 'wedding' | 'conference' | 'fair' | 'custom' = 'wedding') {
  const memory = memoryRuntime();
  memory.workspaces.set('u1', { id: 'ws1', name: "Priya's workspace", plan: 'free' });
  const event = await runAction(memory.runtime, userCtx, createEvent, {
    templateKey,
    name: 'Sharma Wedding',
    startsOn: '2026-12-10',
    endsOn: '2026-12-13',
    timeZone: 'Asia/Kolkata',
    venue: { name: 'Radisson Lawn', address: 'Indore' },
  });
  return { ...memory, event, ctx: { ...userCtx, eventId: event.id } };
}

describe('zonedTimeToUtc', () => {
  it('converts India time (UTC+5:30, no DST)', () => {
    expect(zonedTimeToUtc('2026-12-10', '18:30', 'Asia/Kolkata').toISOString()).toBe(
      '2026-12-10T13:00:00.000Z',
    );
  });

  it('follows daylight saving time', () => {
    // London is UTC+0 in January and UTC+1 in July.
    expect(zonedTimeToUtc('2026-01-15', '10:00', 'Europe/London').toISOString()).toBe(
      '2026-01-15T10:00:00.000Z',
    );
    expect(zonedTimeToUtc('2026-07-15', '10:00', 'Europe/London').toISOString()).toBe(
      '2026-07-15T09:00:00.000Z',
    );
  });
});

describe('eventSlug', () => {
  it('makes URL-safe slugs with a random suffix', () => {
    expect(eventSlug('Sharma Wedding!')).toMatch(/^sharma-wedding-[a-z2-9]{4}$/);
    expect(eventSlug('Café Fête 2026')).toMatch(/^cafe-fete-2026-[a-z2-9]{4}$/);
    expect(eventSlug('शर्मा विवाह')).toMatch(/^event-[a-z2-9]{4}$/);
    expect(eventSlug('x'.repeat(200))).toMatch(SLUG_PATTERN);
  });
});

describe('starterSubEvents', () => {
  it('places sub-events on the event dates, clamping to the last day', () => {
    const oneDay = starterSubEvents(EVENT_TEMPLATES.wedding, '2026-12-10', '2026-12-10');
    expect(oneDay.map((item) => item.date)).toEqual(Array(5).fill('2026-12-10'));
    const conference = starterSubEvents(EVENT_TEMPLATES.conference, '2027-02-05', '2027-02-06');
    expect(conference.at(-1)).toMatchObject({ name: 'Closing', date: '2027-02-06' });
  });

  it('gives a fair one day per date, at most 14', () => {
    const fair = starterSubEvents(EVENT_TEMPLATES.fair, '2027-01-16', '2027-01-18');
    expect(fair.map((item) => item.name)).toEqual(['Day 1', 'Day 2', 'Day 3']);
    expect(starterSubEvents(EVENT_TEMPLATES.fair, '2027-01-01', '2027-03-01')).toHaveLength(14);
  });
});

describe('createEvent', () => {
  it('creates the event with template modules, starter sub-events and the venue', async () => {
    const { event, modules, subEvents } = await withEvent('wedding');

    expect(event).toMatchObject({
      type: 'wedding',
      status: 'planning',
      responseMode: 'invite_only',
      version: 1,
      counts: { subEvents: 5, venues: 1 },
    });
    expect(modules.get(event.id)?.map((item) => `${item.module}:${item.enabled}`)).toEqual([
      'guests:true',
      'registration:false',
      'gallery:true',
    ]);
    const haldi = [...subEvents.values()].find((item) => item.name === 'Haldi');
    // 10:00 in Kolkata is 04:30 UTC.
    expect(haldi?.startsAt).toBe('2026-12-10T04:30:00.000Z');
    expect(haldi?.venueId).not.toBeNull();
  });

  it('retries the slug when it is taken', async () => {
    const memory = memoryRuntime();
    memory.workspaces.set('u1', { id: 'ws1', name: 'w', plan: 'free' });
    // Taken slugs make the first attempts fail; a later one succeeds.
    const realHas = memory.takenSlugs.has.bind(memory.takenSlugs);
    let calls = 0;
    memory.takenSlugs.has = (slug: string) => ++calls <= 2 || realHas(slug);
    const event = await runAction(memory.runtime, userCtx, createEvent, {
      templateKey: 'custom',
      name: 'Meetup',
      startsOn: '2026-12-01',
      endsOn: '2026-12-01',
      timeZone: 'Asia/Kolkata',
    });
    expect(event.slug).toMatch(/^meetup-/);
    expect(calls).toBe(3);
  });
});

describe('updateEvent', () => {
  it('applies changes and bumps the version', async () => {
    const { runtime, ctx } = await withEvent();
    const updated = await runAction(runtime, ctx, updateEvent, {
      expectedVersion: 1,
      changes: { name: 'Sharma–Verma Wedding', budgetPaise: 15_00_000_00 },
    });
    expect(updated).toMatchObject({
      name: 'Sharma–Verma Wedding',
      budgetPaise: 150000000,
      version: 2,
    });
  });

  it('answers a stale version with version_conflict and the current event', async () => {
    const { runtime, ctx } = await withEvent();
    await runAction(runtime, ctx, updateEvent, { expectedVersion: 1, changes: { name: 'A' } });
    await expect(
      runAction(runtime, ctx, updateEvent, { expectedVersion: 1, changes: { name: 'B' } }),
    ).rejects.toMatchObject({
      code: 'version_conflict',
      details: { current: { name: 'A', version: 2 } },
    });
  });

  it('checks dates against the stored ones when only one changes', async () => {
    const { runtime, ctx } = await withEvent();
    await expect(
      runAction(runtime, ctx, updateEvent, {
        expectedVersion: 1,
        changes: { endsOn: '2026-12-01' },
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });
});

describe('replaceModules', () => {
  it("replaces the set under the event's version", async () => {
    const { runtime, ctx } = await withEvent();
    const { modules, event } = await runAction(runtime, ctx, replaceModules, {
      expectedVersion: 1,
      body: { modules: [{ module: 'registration', enabled: true, config: {} }] },
    });
    expect(modules).toEqual([{ module: 'registration', enabled: true, config: {} }]);
    expect(event.version).toBe(2);
  });
});

describe('venues and sub-events', () => {
  it('deleting a venue clears it from its sub-events and bumps their versions', async () => {
    const { runtime, ctx, subEvents } = await withEvent();
    const venueId = [...subEvents.values()][0]!.venueId!;
    await runAction(runtime, ctx, deleteVenue, { venueId });
    for (const subEvent of subEvents.values()) {
      expect(subEvent).toMatchObject({ venueId: null, version: 2 });
    }
  });

  it("refuses another event's venue", async () => {
    const first = await withEvent();
    const other = await runAction(first.runtime, first.ctx, createVenue, { name: 'Hall' });
    const second = await runAction(first.runtime, userCtx, createEvent, {
      templateKey: 'custom',
      name: 'Other',
      startsOn: '2026-12-01',
      endsOn: '2026-12-01',
      timeZone: 'Asia/Kolkata',
    });
    await expect(
      runAction(first.runtime, { ...userCtx, eventId: second.id }, createSubEvent, {
        name: 'Talk',
        startsAt: '2026-12-01T05:00:00Z',
        endsAt: '2026-12-01T06:00:00Z',
        venueId: other.id,
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });

  it('allows a sub-event response mode only with separate guest lists', async () => {
    const { runtime, ctx } = await withEvent();
    await expect(
      runAction(runtime, ctx, createSubEvent, {
        name: 'After party',
        startsAt: '2026-12-13T16:00:00Z',
        endsAt: '2026-12-13T18:00:00Z',
        responseMode: 'invite_rsvp',
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });

  it('guards sub-event updates and deletes by version', async () => {
    const { runtime, ctx, subEvents } = await withEvent();
    const id = [...subEvents.values()][0]!.id;
    await runAction(runtime, ctx, updateSubEvent, {
      subEventId: id,
      expectedVersion: 1,
      changes: { capacity: 200 },
    });
    await expect(
      runAction(runtime, ctx, deleteSubEvent, { subEventId: id, expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: 'version_conflict' });
    await runAction(runtime, ctx, deleteSubEvent, { subEventId: id, expectedVersion: 2 });
    await expect(
      runAction(runtime, ctx, updateSubEvent, { subEventId: id, expectedVersion: 3, changes: {} }),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('refuses a sub-event that would end before it starts, using stored times', async () => {
    const { runtime, ctx, subEvents } = await withEvent();
    const haldi = [...subEvents.values()].find((item) => item.name === 'Haldi')!;
    await expect(
      runAction(runtime, ctx, updateSubEvent, {
        subEventId: haldi.id,
        expectedVersion: 1,
        changes: { endsAt: '2026-12-10T04:00:00Z' },
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });
});
