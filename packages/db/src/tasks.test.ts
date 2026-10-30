import {
  createEvent,
  createTask,
  deleteTask,
  replaceTaskAssignees,
  runAction,
  undoActivity,
  updateTask,
  type ActionContext,
  type ActionDefinition,
  type CoreTx,
} from '@pme/core';
import { TaskQuerySchema, type CreatedEvent } from '@pme/contracts';
import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { taskQueries } from './queries/tasks.js';
import { createActionRuntime } from './runtime.js';
import { activityLog } from './schema/activity.js';
import { members } from './schema/team.js';
import { tasks } from './schema/tasks.js';
import { workspaces } from './schema/workspaces.js';
import {
  connectTestDb,
  deleteTestEvents,
  deleteTestUser,
  insertTestUser,
} from './testing/test-db.js';

const { pool, db } = connectTestDb();
const runtime = createActionRuntime(db);
const queries = taskQueries(db);
let owner: string;
let event: CreatedEvent;
const query = (input: Record<string, unknown> = {}) => TaskQuerySchema.parse(input);

const ctxFor = (userId: string, eventId: string | null): ActionContext => ({
  requestId: 'req_test',
  channel: 'app',
  actor: { kind: 'user', userId, memberId: null },
  eventId,
  now: new Date(),
});
const run = <I, R>(action: ActionDefinition<I, R, CoreTx>, input: I) =>
  runAction(runtime, ctxFor(owner, event.id), action, input);

beforeAll(async () => {
  owner = await insertTestUser(db, 'Priya Sharma');
  await db.insert(workspaces).values({ ownerUserId: owner, name: "Priya's workspace" });
  event = await runAction(runtime, ctxFor(owner, null), createEvent, {
    templateKey: 'wedding',
    name: 'Sharma Wedding',
    startsOn: '2027-03-10',
    endsOn: '2027-03-12',
    timeZone: 'Asia/Kolkata',
  });
});

afterAll(async () => {
  await deleteTestEvents(db, [event.id]);
  await deleteTestUser(db, owner);
  await pool.end();
});

describe('tasks in Postgres', () => {
  it('a new event has its starter tasks, listed with assignees and subtask counts', async () => {
    expect(event.counts.tasks).toBe(12);
    const page = await queries.list(event.id, query(), 'all');
    expect(page.data).toHaveLength(12);
    expect(page.data[0]).toMatchObject({ status: 'todo', assignees: [], subtasks: { total: 0 } });
  });

  it('positions sort byte by byte, and moving to Done goes last there', async () => {
    const { data } = await queries.list(event.id, query(), 'all');
    // "a0V" sorts after "a0" and before "a1" only in byte order ("C" collation).
    const [first, second] = data;
    const between = await run(createTask, { title: 'Between', position: 'a0V' });
    const ordered = await db
      .select({ title: tasks.title })
      .from(tasks)
      .where(and(eq(tasks.eventId, event.id), eq(tasks.status, 'todo')))
      .orderBy(tasks.position);
    expect(ordered.slice(0, 3).map((row) => row.title)).toEqual([
      first!.title,
      'Between',
      second!.title,
    ]);
    const done = await run(updateTask, {
      taskId: between.id,
      expectedVersion: 1,
      changes: { status: 'done' },
    });
    expect(done.completedAt).not.toBeNull();
    // The database refuses done without completed_at.
    await expect(
      db.update(tasks).set({ completedAt: null }).where(eq(tasks.id, between.id)),
    ).rejects.toThrow();
  });

  it('assignees come with their names and feed My tasks', async () => {
    const [member] = await db.select().from(members).where(eq(members.eventId, event.id));
    const venue = (await queries.list(event.id, query(), 'all')).data.find(
      (task) => task.title === 'Book the venue',
    )!;
    const assigned = await run(replaceTaskAssignees, {
      taskId: venue.id,
      expectedVersion: venue.version,
      memberIds: [member!.id],
    });
    expect(assigned.assignees).toEqual([
      { memberId: member!.id, userId: owner, name: 'Priya Sharma' },
    ]);
    const filtered = await queries.list(event.id, query({ assignee: member!.id }), 'all');
    expect(filtered.data.map((task) => task.id)).toEqual([venue.id]);
    const mine = await queries.listMine(owner);
    expect(mine.map((task) => task.id)).toContain(venue.id);
    expect(mine[0]!.event).toMatchObject({ id: event.id, name: 'Sharma Wedding' });
  });

  it('lists only what the caller can see: scoped members get their sub-events only', async () => {
    const all = (await queries.list(event.id, query(), 'all')).data;
    const mehendi = all.find((task) => task.subEventId !== null)!.subEventId!;
    const scoped = await queries.list(event.id, query(), new Set([mehendi]));
    expect(scoped.data.every((task) => task.subEventId === mehendi)).toBe(true);
    expect((await queries.list(event.id, query(), new Set())).data).toEqual([]);
  });

  it('pages by cursor', async () => {
    const first = await queries.list(event.id, query({ limit: 5 }), 'all');
    expect(first.hasMore).toBe(true);
    const next = await queries.list(event.id, query({ limit: 5, cursor: first.nextCursor }), 'all');
    expect(next.data[0]!.id > first.data.at(-1)!.id).toBe(true);
  });

  it('deleting a task takes its subtasks; undo brings back exactly those', async () => {
    const parent = await run(createTask, { title: 'Decor' });
    const keep = await run(createTask, { title: 'Flowers', parentTaskId: parent.id });
    const gone = await run(createTask, { title: 'Lights', parentTaskId: parent.id });
    await run(deleteTask, { taskId: gone.id, expectedVersion: 1 });
    await run(deleteTask, { taskId: parent.id, expectedVersion: 1 });
    expect(await queries.get(event.id, keep.id)).toBeNull();

    const [entry] = await db
      .select()
      .from(activityLog)
      .where(and(eq(activityLog.entityId, parent.id), eq(activityLog.action, 'task.delete')))
      .orderBy(desc(activityLog.createdAt));
    await run(undoActivity, { entryId: entry!.id });
    expect((await queries.get(event.id, parent.id))?.subtasks).toEqual({ total: 1, done: 0 });
    expect(await queries.get(event.id, keep.id)).not.toBeNull();
    // Deleted on its own earlier: stays deleted.
    expect(await queries.get(event.id, gone.id)).toBeNull();
  });
});
