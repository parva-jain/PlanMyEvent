import {
  acceptMemberInvite,
  createEvent,
  createMemberInvite,
  createTask,
  markNotificationsRead,
  notifyDueTasks,
  runAction,
  type ActionContext,
} from '@pme/core';
import { NotificationQuerySchema, type CreatedEvent } from '@pme/contracts';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  deleteExpiredIdempotencyKeys,
  deletePublishedOutbox,
  deleteReadNotifications,
  eventsWithTasksDue,
} from './maintenance.js';
import { notificationQueries } from './queries/notifications.js';
import { teamQueries } from './queries/team.js';
import { createActionRuntime } from './runtime.js';
import { users } from './schema/auth.js';
import { idempotencyKeys } from './schema/idempotency.js';
import { notifications } from './schema/notifications.js';
import { outbox } from './schema/outbox.js';
import { members } from './schema/team.js';
import { workspaces } from './schema/workspaces.js';
import {
  connectTestDb,
  deleteTestEvents,
  deleteTestUser,
  insertTestUser,
  testTopic,
} from './testing/test-db.js';

const { pool, db } = connectTestDb();
const runtime = createActionRuntime(db);
const queries = notificationQueries(db);
let owner: string;
let helper: string;
let helperMemberId: string;
let event: CreatedEvent;

const ctxFor = (userId: string, eventId: string | null): ActionContext => ({
  requestId: 'req_test',
  channel: 'app',
  actor: { kind: 'user', userId, memberId: null },
  eventId,
  now: new Date(),
});
const page = (userId: string, input: Record<string, unknown> = {}) =>
  queries.list(userId, NotificationQuerySchema.parse(input));

beforeAll(async () => {
  owner = await insertTestUser(db, 'Priya Sharma');
  helper = await insertTestUser(db, 'Ravi');
  await db.insert(workspaces).values({ ownerUserId: owner, name: "Priya's workspace" });
  event = await runAction(runtime, ctxFor(owner, null), createEvent, {
    templateKey: 'wedding',
    name: 'Sharma Wedding',
    startsOn: '2027-03-10',
    endsOn: '2027-03-12',
    timeZone: 'Asia/Kolkata',
  });
  const roles = await teamQueries(db).listRoles(event.id);
  const invite = await runAction(runtime, ctxFor(owner, event.id), createMemberInvite, {
    body: {
      grants: [{ roleId: roles.find((role) => role.name === 'Helper')!.id, subEventIds: [] }],
      maxUses: 1,
      expiresInDays: 7,
    },
    linkBase: 'http://localhost:3000/join/',
    inviterName: 'Priya',
  });
  const [{ email }] = (await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, helper))) as [{ email: string }];
  await runAction(runtime, ctxFor(helper, null), acceptMemberInvite, {
    token: invite.token,
    userEmail: email,
  });
  const [member] = await db
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.eventId, event.id), eq(members.userId, helper)));
  helperMemberId = member!.id;
});

afterAll(async () => {
  await deleteTestEvents(db, [event.id]);
  await deleteTestUser(db, helper);
  await deleteTestUser(db, owner);
  await pool.end();
});

describe('notifications in Postgres', () => {
  it('lists a task assignment with the event and the assigner by name, newest first', async () => {
    const first = await runAction(runtime, ctxFor(owner, event.id), createTask, {
      title: 'Book the band',
      assigneeIds: [helperMemberId],
    });
    await runAction(runtime, ctxFor(owner, event.id), createTask, {
      title: 'Order flowers',
      assigneeIds: [helperMemberId],
    });
    const list = await page(helper, { limit: 1 });
    expect(list).toMatchObject({ unreadCount: 2, hasMore: true });
    expect(list.data[0]).toMatchObject({
      type: 'task_assigned',
      data: { taskTitle: 'Order flowers' },
      event: { id: event.id, name: 'Sharma Wedding' },
      actor: { userId: owner, name: 'Priya Sharma' },
      readAt: null,
    });
    const next = await page(helper, { limit: 1, cursor: list.nextCursor });
    expect(next.data[0]).toMatchObject({ data: { taskId: first.id } });
    expect(next.hasMore).toBe(false);
    // The owner assigned them, so the owner has none.
    expect((await page(owner)).data).toHaveLength(0);
  });

  it('marks read by id or all, and filters unread', async () => {
    const [latest] = (await page(helper)).data;
    const result = await runAction(runtime, ctxFor(helper, null), markNotificationsRead, {
      ids: [latest!.id],
    });
    expect(result).toEqual({ updated: 1, unreadCount: 1 });
    expect((await page(helper, { unread: 'true' })).data).toHaveLength(1);
    await runAction(runtime, ctxFor(helper, null), markNotificationsRead, { all: true });
    expect(await queries.unreadCount(helper)).toBe(0);
  });

  it('sends a due-date reminder once per task and day, when the local hour has come', async () => {
    // 10:00 in India on 1 Feb 2027.
    const now = new Date('2027-02-01T04:30:00Z');
    await runAction(runtime, ctxFor(owner, event.id), createTask, {
      title: 'Confirm caterer',
      dueOn: '2027-02-01',
      assigneeIds: [helperMemberId],
    });
    // 07:30 locally: too early.
    expect(
      (await eventsWithTasksDue(db, new Date('2027-01-31T02:00:00Z'))).filter(
        (item) => item.eventId === event.id,
      ),
    ).toEqual([]);
    const targets = (await eventsWithTasksDue(db, now)).filter((item) => item.eventId === event.id);
    expect(targets).toEqual([{ eventId: event.id, dueOn: '2027-02-01' }]);

    const system: ActionContext = {
      requestId: 'req_scan',
      channel: 'system',
      actor: { kind: 'system', name: 'scheduler' },
      eventId: event.id,
      now,
    };
    expect(await runAction(runtime, system, notifyDueTasks, { dueOn: '2027-02-01' })).toEqual({
      notified: 1,
    });
    expect(await runAction(runtime, system, notifyDueTasks, { dueOn: '2027-02-01' })).toEqual({
      notified: 0,
    });
    const [reminder] = (await page(helper, { unread: 'true' })).data;
    expect(reminder).toMatchObject({
      type: 'task_due',
      data: { taskTitle: 'Confirm caterer', dueOn: '2027-02-01' },
      actor: null,
    });
  });
});

describe('retention', () => {
  it('deletes published outbox rows, expired idempotency keys and old read notifications', async () => {
    const topic = testTopic('cleanup');
    const old = new Date(Date.now() - 8 * 86_400_000);
    await db.insert(outbox).values([
      { topic, dedupeKey: 'a', payload: {}, publishedAt: old },
      { topic, dedupeKey: 'b', payload: {}, publishedAt: new Date() },
      { topic, dedupeKey: 'c', payload: {} },
    ]);
    const scope = `test:${topic}`;
    await db.insert(idempotencyKeys).values([
      { scope, key: 'old', requestHash: Buffer.alloc(32), status: 'completed', expiresAt: old },
      {
        scope,
        key: 'fresh',
        requestHash: Buffer.alloc(32),
        status: 'completed',
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    ]);
    const ancient = new Date(Date.now() - 91 * 86_400_000);
    await db
      .update(notifications)
      .set({ createdAt: ancient })
      .where(and(eq(notifications.userId, helper), sql`${notifications.readAt} is not null`));

    await deletePublishedOutbox(db, new Date(Date.now() - 7 * 86_400_000));
    await deleteExpiredIdempotencyKeys(db, new Date());
    await deleteReadNotifications(db, new Date(Date.now() - 90 * 86_400_000));

    const left = await db
      .select({ key: outbox.dedupeKey })
      .from(outbox)
      .where(eq(outbox.topic, topic));
    expect(left.map((row) => row.key).sort()).toEqual(['b', 'c']);
    const keys = await db
      .select({ key: idempotencyKeys.key })
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.scope, scope));
    expect(keys).toEqual([{ key: 'fresh' }]);
    // The two read assignments went; the unread reminder and assignment stay.
    const rest = await page(helper);
    expect(rest.data.map((item) => item.type)).toEqual(['task_due', 'task_assigned']);
    expect(rest.data.every((item) => item.readAt === null)).toBe(true);
    await db.delete(outbox).where(eq(outbox.topic, topic));
  });
});
