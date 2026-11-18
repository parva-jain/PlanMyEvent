import { PERMISSIONS, type EffectivePermissions, type Permission, type Task } from '@pme/contracts';
import { describe, expect, it } from 'vitest';

import { dashboardFor, type DashboardAggregate } from './dashboard.js';

const HALDI = '0192f6c1-0000-7000-8000-00000000000a';
const SANGEET = '0192f6c1-0000-7000-8000-00000000000b';
const now = new Date('2026-12-01T06:00:00Z');

const task = (id: string, subEventId: string | null, dueOn: string): Task => ({
  id: `0192f6c1-0000-7000-8000-0000000001${id}`,
  title: `Task ${id}`,
  description: null,
  status: 'todo',
  priority: 'medium',
  category: null,
  dueOn,
  subEventId,
  parentTaskId: null,
  position: 'a0',
  completedAt: null,
  assignees: [],
  subtasks: { total: 0, done: 0 },
  version: 1,
  createdAt: '2026-11-01T00:00:00.000Z',
});

const headcount = (subEventId: string | null, confirmed: number) => ({
  subEventId,
  expected: confirmed + 10,
  confirmed,
  registered: 0,
  waitlisted: 0,
  declined: 1,
  checkedIn: 0,
});

const aggregate: DashboardAggregate = {
  event: {
    startsOn: '2026-12-10',
    endsOn: '2026-12-12',
    timeZone: 'Asia/Kolkata',
    guestScope: 'per_sub_event',
    budgetPaise: 250_000_000,
    today: '2026-12-01',
  },
  subEvents: [
    {
      id: HALDI,
      name: 'Haldi',
      startsAt: '2026-12-10T04:30:00.000Z',
      endsAt: '2026-12-10T08:30:00.000Z',
      groupLabel: null,
      capacity: 100,
    },
    {
      id: SANGEET,
      name: 'Sangeet',
      startsAt: '2026-12-10T13:30:00.000Z',
      endsAt: '2026-12-10T18:30:00.000Z',
      groupLabel: null,
      capacity: null,
    },
  ],
  tasks: [
    { subEventId: null, total: 10, done: 4, inProgress: 2, blocked: 0, overdue: 1, dueThisWeek: 2 },
    { subEventId: HALDI, total: 3, done: 1, inProgress: 1, blocked: 1, overdue: 1, dueThisWeek: 0 },
    {
      subEventId: SANGEET,
      total: 2,
      done: 0,
      inProgress: 0,
      blocked: 0,
      overdue: 0,
      dueThisWeek: 1,
    },
  ],
  upcomingTasks: [
    task('01', null, '2026-11-30'),
    task('02', HALDI, '2026-11-29'),
    task('03', SANGEET, '2026-12-03'),
  ],
  categories: [
    { id: '0192f6c1-0000-7000-8000-000000000c01', name: 'Venue', plannedPaise: 100_000_00 },
    { id: '0192f6c1-0000-7000-8000-000000000c02', name: 'Food', plannedPaise: 50_000_00 },
  ],
  expenses: [
    {
      categoryId: '0192f6c1-0000-7000-8000-000000000c01',
      subEventId: null,
      committedPaise: 80_000_00,
      paidPaise: 20_000_00,
    },
    {
      categoryId: '0192f6c1-0000-7000-8000-000000000c02',
      subEventId: HALDI,
      committedPaise: 10_000_00,
      paidPaise: 0,
    },
  ],
  paymentsDue: [
    { subEventId: null, count: 1, outstandingPaise: 60_000_00 },
    { subEventId: HALDI, count: 1, outstandingPaise: 10_000_00 },
  ],
  attendance: [headcount(HALDI, 40), headcount(SANGEET, 70)],
  invitations: [
    { subEventIds: [HALDI], notSent: 1, sentDigitally: 2, deliveredInPerson: 3 },
    { subEventIds: [HALDI, SANGEET], notSent: 0, sentDigitally: 0, deliveredInPerson: 5 },
    { subEventIds: [SANGEET], notSent: 4, sentDigitally: 0, deliveredInPerson: 0 },
  ],
  registrationTotals: [{ subEventId: SANGEET, total: 12, waitlisted: 2 }],
  registrations: [
    { subEventId: SANGEET, date: '2026-12-01', count: 5 },
    { subEventId: SANGEET, date: '2026-11-25', count: 7 },
  ],
  members: 6,
  generatedAt: '2026-12-01T05:59:50.000Z',
};

const everything: EffectivePermissions = { wholeEvent: [...PERMISSIONS], subEvents: {} };
const scoped = (subEventId: string, permissions: Permission[]): EffectivePermissions => ({
  wholeEvent: ['event.view'],
  subEvents: { [subEventId]: permissions },
});

describe('dashboardFor', () => {
  it('gives a whole-event organizer every number', () => {
    const view = dashboardFor(aggregate, everything, now);
    expect(view.countdown).toEqual({
      eventStartsOn: '2026-12-10',
      eventEndsOn: '2026-12-12',
      timeZone: 'Asia/Kolkata',
      daysToGo: 9,
      nextSubEvent: { id: HALDI, name: 'Haldi', startsAt: '2026-12-10T04:30:00.000Z' },
    });
    expect(view.tasks).toMatchObject({ total: 15, done: 5, overdue: 2, dueThisWeek: 3 });
    // Earliest due first, overdue ones leading.
    expect(view.tasks!.upcoming.map((item) => item.dueOn)).toEqual([
      '2026-11-29',
      '2026-11-30',
      '2026-12-03',
    ]);
    expect(view.budget).toMatchObject({
      budgetPaise: 250_000_000,
      plannedPaise: 150_000_00,
      committedPaise: 90_000_00,
      paidPaise: 20_000_00,
      paymentsDue: { count: 2, outstandingPaise: 70_000_00 },
    });
    expect(view.invitations).toEqual({
      total: 15,
      notSent: 5,
      sentDigitally: 2,
      deliveredInPerson: 8,
    });
    expect(view.subEvents.map((item) => item.taken)).toEqual([40, 70]);
    expect(view.registrations!.total).toBe(12);
    expect(view.registrations!.daily).toHaveLength(14);
    expect(view.registrations!.daily.at(-1)).toEqual({ date: '2026-12-01', count: 5 });
    expect(view.registrations!.daily.find((day) => day.date === '2026-11-25')!.count).toBe(7);
    expect(view.team).toEqual({ members: 6 });
  });

  it('shows a member scoped to Haldi only what Haldi covers', () => {
    const view = dashboardFor(
      aggregate,
      scoped(HALDI, ['subevents.view', 'tasks.view', 'budget.view', 'guests.view']),
      now,
    );
    expect(view.subEvents.map((item) => item.name)).toEqual(['Haldi']);
    // Event-wide tasks need a whole-event grant.
    expect(view.tasks).toMatchObject({ total: 3, overdue: 1 });
    expect(view.tasks!.upcoming.map((item) => item.subEventId)).toEqual([HALDI]);
    // Planned is per category (event-wide); committed and paid only over Haldi's expenses.
    expect(view.budget).toMatchObject({
      plannedPaise: 150_000_00,
      committedPaise: 10_000_00,
      paidPaise: 0,
      paymentsDue: { count: 1, outstandingPaise: 10_000_00 },
    });
    expect(view.headcounts!.map((row) => row.subEventId)).toEqual([HALDI]);
    // Invitations covering Haldi, including the one covering both.
    expect(view.invitations!.total).toBe(11);
    expect(view.registrations).toBeNull();
    expect(view.team).toBeNull();
  });

  it('leaves out sections without a permission, and taken where guests are not visible', () => {
    const view = dashboardFor(aggregate, scoped(SANGEET, ['subevents.view']), now);
    expect(view.tasks).toBeNull();
    expect(view.budget).toBeNull();
    expect(view.headcounts).toBeNull();
    expect(view.invitations).toBeNull();
    expect(view.subEvents).toEqual([expect.objectContaining({ id: SANGEET, taken: null })]);
    expect(view.countdown.nextSubEvent?.name).toBe('Sangeet');
  });

  it('uses the event-wide headcount for every sub-event when guests come to all of them', () => {
    const view = dashboardFor(
      {
        ...aggregate,
        event: { ...aggregate.event, guestScope: 'whole_event' },
        attendance: [headcount(null, 90)],
      },
      everything,
      now,
    );
    expect(view.subEvents.map((item) => item.taken)).toEqual([90, 90]);
  });

  it('counts down past the start as negative, with no next sub-event once all have begun', () => {
    const view = dashboardFor(
      { ...aggregate, event: { ...aggregate.event, today: '2026-12-11' } },
      everything,
      new Date('2026-12-11T06:00:00Z'),
    );
    expect(view.countdown.daysToGo).toBe(-1);
    expect(view.countdown.nextSubEvent).toBeNull();
  });
});
