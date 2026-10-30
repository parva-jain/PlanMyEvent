import type { MyTask, Task, TaskQuery } from '@pme/contracts';
import { and, asc, eq, gt, inArray, isNull, lte, ne, sql, type SQL } from 'drizzle-orm';

import type { Database } from '../client.js';
import { events } from '../schema/events.js';
import { members } from '../schema/team.js';
import { taskAssignees, tasks } from '../schema/tasks.js';
import { taskStore, withDetails } from '../stores/tasks.js';
import { decodeCursor, encodeCursor } from './cursor.js';

/** Which sub-events' tasks the caller may read: all, or these (whole-event tasks excluded). */
export type TaskVisibility = 'all' | ReadonlySet<string>;

const visibleTo = (visible: TaskVisibility): SQL | undefined =>
  visible === 'all'
    ? undefined
    : visible.size
      ? inArray(tasks.subEventId, [...visible])
      : // No sub-events: nothing, since whole-event tasks need a whole-event grant.
        sql`false`;

/** Task reads for the API; callers check tasks.view first and pass what it covers. */
export function taskQueries(db: Database) {
  const store = taskStore(db);
  return {
    async get(eventId: string, taskId: string): Promise<Task | null> {
      return store.find(eventId, taskId);
    },

    /**
     * GET E/tasks: oldest first by id (UUIDv7), cursor-paginated; the client sorts by column
     * and position. Filtered to what the caller can see, never refused (APIDesign).
     */
    async list(eventId: string, query: TaskQuery, visible: TaskVisibility) {
      const filters: (SQL | undefined)[] = [
        eq(tasks.eventId, eventId),
        isNull(tasks.deletedAt),
        visibleTo(visible),
      ];
      if (query.status) filters.push(eq(tasks.status, query.status));
      if (query.subEventId) filters.push(eq(tasks.subEventId, query.subEventId));
      if (query.parentTaskId) filters.push(eq(tasks.parentTaskId, query.parentTaskId));
      if (query.dueBefore) filters.push(lte(tasks.dueOn, query.dueBefore));
      if (query.assignee) {
        filters.push(
          inArray(
            tasks.id,
            db
              .select({ id: taskAssignees.taskId })
              .from(taskAssignees)
              .where(eq(taskAssignees.memberId, query.assignee)),
          ),
        );
      }
      if (query.cursor) filters.push(gt(tasks.id, decodeCursor(query.cursor)));
      const rows = await db
        .select()
        .from(tasks)
        .where(and(...filters))
        .orderBy(asc(tasks.id))
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      const hasMore = rows.length > query.limit;
      return {
        data: await withDetails(db, page),
        nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null,
        hasMore,
      };
    },

    /**
     * GET /v1/me/tasks: open tasks assigned to me in live events where I'm still a member,
     * earliest due first. The caller drops ones my current roles can't see.
     */
    async listMine(userId: string, limit = 200): Promise<MyTask[]> {
      const rows = await db
        .select({
          task: tasks,
          event: { id: events.id, name: events.name, timeZone: events.timeZone },
        })
        .from(taskAssignees)
        .innerJoin(
          members,
          and(
            eq(members.id, taskAssignees.memberId),
            eq(members.userId, userId),
            eq(members.status, 'active'),
          ),
        )
        .innerJoin(tasks, and(eq(tasks.id, taskAssignees.taskId), isNull(tasks.deletedAt)))
        .innerJoin(events, and(eq(events.id, tasks.eventId), isNull(events.deletedAt)))
        .where(ne(tasks.status, 'done'))
        .orderBy(asc(tasks.dueOn), asc(tasks.id))
        .limit(limit);
      const details = await withDetails(
        db,
        rows.map((row) => row.task),
      );
      return details.map((task, index) => ({ ...task, event: rows[index]!.event }));
    },
  };
}

export type TaskQueries = ReturnType<typeof taskQueries>;
