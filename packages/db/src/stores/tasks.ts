import type { Task } from '@pme/contracts';
import type { TaskStore } from '@pme/core';
import { and, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';

import type { Database } from '../client.js';
import type { DrizzleTx } from '../runtime.js';
import { users } from '../schema/auth.js';
import { members } from '../schema/team.js';
import { taskAssignees, tasks } from '../schema/tasks.js';

type Queryable = Database | DrizzleTx;
type TaskRow = typeof tasks.$inferSelect;

/** Fractional indexes compare byte by byte, whatever the database's collation. */
export const byPosition = sql`${tasks.position} collate "C"`;

const liveTask = (eventId: string, taskId: string) =>
  and(eq(tasks.eventId, eventId), eq(tasks.id, taskId), isNull(tasks.deletedAt));

/**
 * Task rows as the API returns them: with assignees (active members, by name) and, for top-level tasks, how many live subtasks they have and how many are done.
 */
export async function withDetails(db: Queryable, rows: TaskRow[]): Promise<Task[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const assignees = await db
    .select({
      taskId: taskAssignees.taskId,
      memberId: members.id,
      userId: members.userId,
      name: users.name,
      email: users.email,
    })
    .from(taskAssignees)
    .innerJoin(members, and(eq(members.id, taskAssignees.memberId), eq(members.status, 'active')))
    .innerJoin(users, eq(users.id, members.userId))
    .where(inArray(taskAssignees.taskId, ids))
    .orderBy(users.name, members.id);
  const counts = await db
    .select({
      parentTaskId: tasks.parentTaskId,
      total: sql<number>`count(*)::int`,
      done: sql<number>`(count(*) filter (where ${tasks.status} = 'done'))::int`,
    })
    .from(tasks)
    .where(and(inArray(tasks.parentTaskId, ids), isNull(tasks.deletedAt)))
    .groupBy(tasks.parentTaskId);

  const subtasksOf = (taskId: string) => {
    const count = counts.find((item) => item.parentTaskId === taskId);
    return { total: count?.total ?? 0, done: count?.done ?? 0 };
  };
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status as Task['status'],
    priority: row.priority as Task['priority'],
    category: row.category,
    dueOn: row.dueOn,
    subEventId: row.subEventId,
    parentTaskId: row.parentTaskId,
    position: row.position,
    completedAt: row.completedAt?.toISOString() ?? null,
    assignees: assignees
      .filter((item) => item.taskId === row.id)
      .map(({ memberId, userId, name, email }) => ({
        memberId,
        userId,
        name: name.trim() || email.split('@')[0]!,
      })),
    subtasks: subtasksOf(row.id),
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  }));
}

export function taskStore(db: Queryable): TaskStore {
  const one = async (where: SQL | undefined) => {
    const [row] = await db.select().from(tasks).where(where);
    return row ? ((await withDetails(db, [row]))[0] ?? null) : null;
  };
  return {
    async insert(eventId, list) {
      if (!list.length) return [];
      const rows = await db
        .insert(tasks)
        .values(list.map(({ assigneeIds: _ids, ...task }) => ({ eventId, ...task })))
        .returning();
      const assignments = list.flatMap((task, index) =>
        (task.assigneeIds ?? []).map((memberId) => ({
          taskId: rows[index]!.id,
          eventId,
          memberId,
        })),
      );
      if (assignments.length) await db.insert(taskAssignees).values(assignments);
      return withDetails(db, rows);
    },
    find: (eventId, taskId) => one(liveTask(eventId, taskId)),
    async lastPosition(eventId, column) {
      const [row] = await db
        .select({ position: tasks.position })
        .from(tasks)
        .where(
          and(
            eq(tasks.eventId, eventId),
            isNull(tasks.deletedAt),
            'status' in column
              ? and(isNull(tasks.parentTaskId), eq(tasks.status, column.status))
              : eq(tasks.parentTaskId, column.parentTaskId),
          ),
        )
        .orderBy(desc(byPosition))
        .limit(1);
      return row?.position ?? null;
    },
    async update(eventId, taskId, expectedVersion, changes) {
      const [row] = await db
        .update(tasks)
        .set({ ...changes, version: sql`${tasks.version} + 1` })
        .where(and(liveTask(eventId, taskId), eq(tasks.version, expectedVersion)))
        .returning();
      return row ? ((await withDetails(db, [row]))[0] ?? null) : null;
    },
    async softDelete(eventId, taskId, expectedVersion) {
      const rows = await db
        .update(tasks)
        .set({ deletedAt: sql`now()`, version: sql`${tasks.version} + 1` })
        .where(and(liveTask(eventId, taskId), eq(tasks.version, expectedVersion)))
        .returning({ id: tasks.id });
      if (!rows.length) return false;
      // now() is the transaction's start time: the subtasks share the parent's deleted_at,
      // which is how restore knows which ones went with it.
      await db
        .update(tasks)
        .set({ deletedAt: sql`now()`, version: sql`${tasks.version} + 1` })
        .where(
          and(eq(tasks.eventId, eventId), eq(tasks.parentTaskId, taskId), isNull(tasks.deletedAt)),
        );
      return true;
    },
    async restore(eventId, taskId) {
      const deleted = and(
        eq(tasks.eventId, eventId),
        eq(tasks.id, taskId),
        isNotNull(tasks.deletedAt),
      );
      // Compared in SQL: a JS Date would drop Postgres's microseconds.
      const deletedAt = db.select({ deletedAt: tasks.deletedAt }).from(tasks).where(deleted);
      await db
        .update(tasks)
        .set({ deletedAt: null, version: sql`${tasks.version} + 1` })
        .where(
          and(
            eq(tasks.eventId, eventId),
            eq(tasks.parentTaskId, taskId),
            eq(tasks.deletedAt, sql`(${deletedAt})`),
          ),
        );
      const [restored] = await db
        .update(tasks)
        .set({ deletedAt: null, version: sql`${tasks.version} + 1` })
        .where(deleted)
        .returning();
      return restored ? ((await withDetails(db, [restored]))[0] ?? null) : null;
    },
    async replaceAssignees(eventId, taskId, expectedVersion, memberIds) {
      const [row] = await db
        .update(tasks)
        .set({ version: sql`${tasks.version} + 1` })
        .where(and(liveTask(eventId, taskId), eq(tasks.version, expectedVersion)))
        .returning();
      if (!row) return null;
      await db.delete(taskAssignees).where(eq(taskAssignees.taskId, taskId));
      if (memberIds.length) {
        await db
          .insert(taskAssignees)
          .values(memberIds.map((memberId) => ({ taskId, eventId, memberId })));
      }
      return (await withDetails(db, [row]))[0] ?? null;
    },
  };
}
