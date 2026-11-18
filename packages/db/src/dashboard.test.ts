import {
  createContact,
  createExpense,
  createEvent,
  createHousehold,
  createInvitation,
  createTask,
  runAction,
  updateInvitation,
  type ActionContext,
  type ActionDefinition,
  type CoreTx,
  type DashboardAggregate,
} from '@pme/core';
import type { CreatedEvent } from '@pme/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { budgetQueries } from './queries/budget.js';
import { loadDashboardAggregate } from './queries/dashboard.js';
import { eventQueries } from './queries/events.js';
import { createActionRuntime } from './runtime.js';
import { attendance } from './schema/invitations.js';
import { workspaces } from './schema/workspaces.js';
import {
  connectTestDb,
  deleteTestEvents,
  deleteTestUser,
  insertTestUser,
} from './testing/test-db.js';

const { pool, db } = connectTestDb();
const runtime = createActionRuntime(db, {
  invitationLinkKey: 'dashboard-test-key-0123456789abcdef',
});
let owner: string;
let event: CreatedEvent;
// 10:00 in India on 1 Feb 2027; the wedding starts on the 10th.
const now = new Date('2027-02-01T04:30:00Z');

const ctxFor = (eventId: string | null): ActionContext => ({
  requestId: 'req_test',
  channel: 'app',
  actor: { kind: 'user', userId: owner, memberId: null },
  eventId,
  now: new Date(),
});
const run = <I, R>(action: ActionDefinition<I, R, CoreTx>, input: I) =>
  runAction(runtime, ctxFor(event.id), action, input);
const load = async () => (await loadDashboardAggregate(db, event.id, now))!;
const eventWide = <T extends { subEventId: string | null }>(rows: T[]) =>
  rows.find((row) => row.subEventId === null);

beforeAll(async () => {
  owner = await insertTestUser(db, 'Priya Sharma');
  await db.insert(workspaces).values({ ownerUserId: owner, name: "Priya's workspace" });
  event = await runAction(runtime, ctxFor(null), createEvent, {
    templateKey: 'wedding',
    name: 'Sharma Wedding',
    startsOn: '2027-02-10',
    endsOn: '2027-02-12',
    timeZone: 'Asia/Kolkata',
  });
});

afterAll(async () => {
  await deleteTestEvents(db, [event.id]);
  await deleteTestUser(db, owner);
  await pool.end();
});

describe('dashboard aggregate in Postgres', () => {
  it('reads the event, its sub-events, starter categories and the owner', async () => {
    const aggregate = await load();
    expect(aggregate.event).toMatchObject({
      startsOn: '2027-02-10',
      timeZone: 'Asia/Kolkata',
      today: '2027-02-01',
    });
    expect(aggregate.subEvents).toHaveLength(5);
    expect(aggregate.subEvents.map((item) => item.startsAt)).toEqual(
      [...aggregate.subEvents.map((item) => item.startsAt)].sort(),
    );
    expect(aggregate.categories).toHaveLength(12);
    expect(aggregate.members).toBe(1);
    expect(aggregate.generatedAt).toBe(now.toISOString());
  });

  it('counts top-level tasks by state and keeps the earliest due per scope', async () => {
    const before = eventWide((await load()).tasks);
    const [haldi] = (await eventQueries(db).listSubEvents(event.id)).filter(
      (item) => item.name === 'Haldi',
    );
    const overdue = await run(createTask, { title: 'Book pandit', dueOn: '2027-01-30' });
    await run(createTask, { title: 'Collect sherwani', dueOn: '2027-02-05' });
    await run(createTask, { title: 'Subtask', parentTaskId: overdue.id, dueOn: '2027-01-20' });
    await run(createTask, { title: 'Turmeric', subEventId: haldi!.id, dueOn: '2027-02-02' });

    const aggregate = await load();
    const wide = eventWide(aggregate.tasks)!;
    // The subtask doesn't count.
    expect(wide.total - (before?.total ?? 0)).toBe(2);
    expect(wide.overdue - (before?.overdue ?? 0)).toBe(1);
    expect(wide.dueThisWeek - (before?.dueThisWeek ?? 0)).toBe(1);
    expect(aggregate.tasks.find((row) => row.subEventId === haldi!.id)).toMatchObject({
      total: 1,
      dueThisWeek: 1,
    });
    const upcoming = aggregate.upcomingTasks;
    expect(upcoming.some((task) => task.title === 'Turmeric')).toBe(true);
    expect(upcoming.some((task) => task.title === 'Subtask')).toBe(false);
    expect(upcoming.filter((task) => task.subEventId === null).length).toBeLessThanOrEqual(5);
  });

  it('sums expenses per category and scope, and payments due within the week', async () => {
    const categories = await budgetQueries(db).listCategories(event.id, 'all');
    const venue = categories.find((item) => item.name === 'Venue')!.id;
    await run(createExpense, {
      categoryId: venue,
      title: 'Lawn booking',
      amountPaise: 30_000_000,
      paidPaise: 10_000_000,
      paymentStatus: 'advance_paid',
      dueOn: '2027-02-05',
    });
    await run(createExpense, {
      categoryId: venue,
      title: 'Generator',
      amountPaise: 1_000_000,
      dueOn: '2027-03-01',
    });
    const aggregate = await load();
    expect(aggregate.expenses).toEqual([
      { categoryId: venue, subEventId: null, committedPaise: 31_000_000, paidPaise: 10_000_000 },
    ]);
    expect(aggregate.paymentsDue).toEqual([
      { subEventId: null, count: 1, outstandingPaise: 20_000_000 },
    ]);
  });

  it('counts headcounts by party size, invitations by delivery and registrations by day', async () => {
    const household = await run(createHousehold, { name: 'Verma family', expectedCount: 4 });
    const invitation = await run(createInvitation, { householdId: household.id });
    await run(updateInvitation, {
      invitationId: invitation.id,
      expectedVersion: invitation.version,
      changes: { deliveryStatus: 'delivered_in_person' },
    });
    await run(createHousehold, { name: 'Not invited', expectedCount: 2 });
    const scope = invitation.attendance[0]!.subEventId;
    // Open registration arrives in 8d; rows as it will write them.
    const anil = await run(createContact, { name: 'Anil' });
    const meera = await run(createContact, { name: 'Meera' });
    await db.insert(attendance).values([
      {
        contactId: anil.id,
        eventId: event.id,
        subEventId: scope,
        source: 'registered',
        status: 'registered',
        partySize: 2,
        createdAt: new Date('2027-01-31T20:00:00Z'), // 1 Feb in India
      },
      {
        contactId: meera.id,
        eventId: event.id,
        subEventId: scope,
        source: 'registered',
        status: 'waitlisted',
        partySize: 1,
        createdAt: new Date('2027-01-25T06:00:00Z'),
      },
    ]);

    const aggregate: DashboardAggregate = await load();
    const row = aggregate.attendance.find((item) => item.subEventId === scope)!;
    expect(row).toMatchObject({ expected: 7, registered: 2, waitlisted: 1, confirmed: 0 });
    const delivered = aggregate.invitations.reduce(
      (sum, group) => sum + group.deliveredInPerson,
      0,
    );
    expect(delivered).toBe(1);
    expect(aggregate.registrationTotals).toEqual([{ subEventId: scope, total: 2, waitlisted: 1 }]);
    expect(aggregate.registrations).toEqual(
      expect.arrayContaining([
        { subEventId: scope, date: '2027-02-01', count: 2 },
        { subEventId: scope, date: '2027-01-25', count: 1 },
      ]),
    );
  });

  it('is null for a deleted or unknown event', async () => {
    expect(await loadDashboardAggregate(db, '0192f6c1-0000-7000-8000-000000000000', now)).toBe(
      null,
    );
  });
});
