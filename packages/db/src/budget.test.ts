import {
  createBudgetCategory,
  createEvent,
  createExpense,
  deleteBudgetCategory,
  runAction,
  undoActivity,
  type ActionContext,
  type ActionDefinition,
  type CoreTx,
} from '@pme/core';
import { ExpenseQuerySchema, type CreatedEvent } from '@pme/contracts';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { budgetQueries } from './queries/budget.js';
import { eventQueries } from './queries/events.js';
import { createActionRuntime } from './runtime.js';
import { activityLog } from './schema/activity.js';
import { expenses } from './schema/budget.js';
import { workspaces } from './schema/workspaces.js';
import {
  connectTestDb,
  deleteTestEvents,
  deleteTestUser,
  insertTestUser,
} from './testing/test-db.js';

const { pool, db } = connectTestDb();
const runtime = createActionRuntime(db);
const queries = budgetQueries(db);
let owner: string;
let event: CreatedEvent;

const ctxFor = (eventId: string | null): ActionContext => ({
  requestId: 'req_test',
  channel: 'app',
  actor: { kind: 'user', userId: owner, memberId: null },
  eventId,
  now: new Date(),
});
const run = <I, R>(action: ActionDefinition<I, R, CoreTx>, input: I) =>
  runAction(runtime, ctxFor(event.id), action, input);
const categoryId = async (name: string) =>
  (await queries.listCategories(event.id, 'all')).find((item) => item.name === name)!.id;

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

describe('budget in Postgres', () => {
  it('a new event has its starter categories, in order, with zero totals', async () => {
    expect(event.counts.budgetCategories).toBe(12);
    const list = await queries.listCategories(event.id, 'all');
    expect(list.slice(0, 2)).toMatchObject([
      { name: 'Venue', plannedPaise: 0, committedPaise: 0, paidPaise: 0, expenseCount: 0 },
      { name: 'Catering' },
    ]);
  });

  it('totals add up committed and paid, counting only expenses the caller can see', async () => {
    const catering = await categoryId('Catering');
    const [mehendi] = (await eventQueries(db).listSubEvents(event.id)).filter(
      (item) => item.name === 'Mehendi',
    );
    await run(createExpense, {
      categoryId: catering,
      title: 'Caterer advance',
      amountPaise: 18_000_000,
      paidPaise: 2_000_000,
      paymentStatus: 'advance_paid',
    });
    await run(createExpense, {
      categoryId: catering,
      subEventId: mehendi!.id,
      title: 'Mehendi snacks',
      amountPaise: 500_000,
      paidPaise: 500_000,
    });
    const all = (await queries.listCategories(event.id, 'all')).find(
      (item) => item.id === catering,
    );
    expect(all).toMatchObject({
      committedPaise: 18_500_000,
      paidPaise: 2_500_000,
      expenseCount: 2,
    });
    const scoped = (await queries.listCategories(event.id, new Set([mehendi!.id]))).find(
      (item) => item.id === catering,
    );
    expect(scoped).toMatchObject({ committedPaise: 500_000, expenseCount: 1 });
    const list = await queries.listExpenses(
      event.id,
      ExpenseQuerySchema.parse({ paymentStatus: 'paid' }),
      'all',
    );
    expect(list.data.map((item) => item.title)).toEqual(['Mehendi snacks']);
  });

  it('a duplicate reference is refused without breaking the transaction; the database checks amounts', async () => {
    const venue = await categoryId('Venue');
    const base = { categoryId: venue, amountPaise: 1000, paidPaise: 1000 };
    await run(createExpense, { ...base, title: 'Booking', transactionRef: 'UTR-1' });
    await expect(
      run(createExpense, { ...base, title: 'Again', transactionRef: 'UTR-1' }),
    ).rejects.toMatchObject({ code: 'duplicate_transaction_ref' });
    // The check constraint backs up the action's rule.
    await expect(
      db
        .update(expenses)
        .set({ paymentStatus: 'planned' })
        .where(and(eq(expenses.eventId, event.id), eq(expenses.title, 'Booking'))),
    ).rejects.toThrow();
  });

  it('a restored category whose name was taken meanwhile is a conflict', async () => {
    const flowers = await run(createBudgetCategory, { name: 'Flowers' });
    await run(deleteBudgetCategory, { categoryId: flowers.id, expectedVersion: 1 });
    const [entry] = await db
      .select()
      .from(activityLog)
      .where(eq(activityLog.entityId, flowers.id))
      .orderBy(desc(activityLog.createdAt));
    await run(createBudgetCategory, { name: 'flowers' });
    await expect(run(undoActivity, { entryId: entry!.id })).rejects.toMatchObject({
      code: 'conflict',
    });
  });
});
