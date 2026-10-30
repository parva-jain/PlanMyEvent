import type { ActivityItem, ActivityPage, ActivityQuery } from '@pme/contracts';
import { isUndoable, type StoredActivity } from '@pme/core';
import { and, desc, eq, gte, inArray, notInArray, sql, type SQL } from 'drizzle-orm';

import type { Database } from '../client.js';
import { users } from '../schema/auth.js';
import { activityLog } from '../schema/activity.js';
import { budgetCategories, expenses } from '../schema/budget.js';
import { events, subEvents, venues } from '../schema/events.js';
import { contacts, households } from '../schema/guests.js';
import { tasks } from '../schema/tasks.js';
import { memberInvites, members, roles } from '../schema/team.js';
import { toStoredActivity } from '../stores/activity.js';
import { decodeCursor, encodeCursor } from './cursor.js';

/** Who is reading: canUndo depends on it. */
export interface ActivityViewer {
  userId: string;
  /** Holds event.settings, so may undo anyone's change. */
  canUndoOthers: boolean;
  /**
   * Entity types left out of the feed: guests' entries carry phones and emails, so only
   * those who may see the guest list see them.
   */
  hiddenTypes: readonly string[];
}

/** The display name a snapshot carries: `name`, or a task's `title`. */
const nameOf = (value: unknown) => {
  const { name, title } = (value ?? {}) as { name?: unknown; title?: unknown };
  return typeof name === 'string' ? name : typeof title === 'string' ? title : null;
};

/** Activity reads for the API. Callers check activity.view first. */
export function activityQueries(db: Database) {
  /**
   * Names for entries whose snapshot doesn't carry one (an update that didn't rename).
   * Deleted rows still have their names, so the log keeps reading right.
   */
  async function labels(eventId: string, rows: StoredActivity[]) {
    const ids = (type: string) => [
      ...new Set(rows.filter((row) => row.entityType === type).map((row) => row.entityId)),
    ];
    const found = new Map<string, string>();
    const add = (list: { id: string; label: string | null }[]) => {
      for (const { id, label } of list) if (label) found.set(id, label);
    };
    const subEventIds = ids('sub_event');
    if (subEventIds.length) {
      add(
        await db
          .select({ id: subEvents.id, label: subEvents.name })
          .from(subEvents)
          .where(and(eq(subEvents.eventId, eventId), inArray(subEvents.id, subEventIds))),
      );
    }
    const venueIds = ids('venue');
    if (venueIds.length) {
      add(
        await db
          .select({ id: venues.id, label: venues.name })
          .from(venues)
          .where(and(eq(venues.eventId, eventId), inArray(venues.id, venueIds))),
      );
    }
    const roleIds = ids('role');
    if (roleIds.length) {
      add(
        await db
          .select({ id: roles.id, label: roles.name })
          .from(roles)
          .where(and(eq(roles.eventId, eventId), inArray(roles.id, roleIds))),
      );
    }
    const memberIds = ids('member');
    if (memberIds.length) {
      add(
        await db
          .select({ id: members.id, label: users.name })
          .from(members)
          .innerJoin(users, eq(users.id, members.userId))
          .where(and(eq(members.eventId, eventId), inArray(members.id, memberIds))),
      );
    }
    const categoryIds = ids('budget_category');
    if (categoryIds.length) {
      add(
        await db
          .select({ id: budgetCategories.id, label: budgetCategories.name })
          .from(budgetCategories)
          .where(
            and(eq(budgetCategories.eventId, eventId), inArray(budgetCategories.id, categoryIds)),
          ),
      );
    }
    const expenseIds = ids('expense');
    if (expenseIds.length) {
      add(
        await db
          .select({ id: expenses.id, label: expenses.title })
          .from(expenses)
          .where(and(eq(expenses.eventId, eventId), inArray(expenses.id, expenseIds))),
      );
    }
    const taskIds = ids('task');
    if (taskIds.length) {
      add(
        await db
          .select({ id: tasks.id, label: tasks.title })
          .from(tasks)
          .where(and(eq(tasks.eventId, eventId), inArray(tasks.id, taskIds))),
      );
    }
    const householdIds = ids('household');
    if (householdIds.length) {
      add(
        await db
          .select({ id: households.id, label: households.name })
          .from(households)
          .where(and(eq(households.eventId, eventId), inArray(households.id, householdIds))),
      );
    }
    const contactIds = ids('contact');
    if (contactIds.length) {
      add(
        await db
          .select({ id: contacts.id, label: contacts.name })
          .from(contacts)
          .where(and(eq(contacts.eventId, eventId), inArray(contacts.id, contactIds))),
      );
    }
    const inviteIds = ids('member_invite');
    if (inviteIds.length) {
      add(
        await db
          .select({ id: memberInvites.id, label: sql<string | null>`${memberInvites.email}::text` })
          .from(memberInvites)
          .where(and(eq(memberInvites.eventId, eventId), inArray(memberInvites.id, inviteIds))),
      );
    }
    if (rows.some((row) => row.entityType === 'event' || row.entityType === 'event_modules')) {
      const [event] = await db
        .select({ id: events.id, label: events.name })
        .from(events)
        .where(eq(events.id, eventId));
      if (event) found.set(event.id, event.label);
    }
    return found;
  }

  /** The undo entries for the undone rows of a page: "Undone by Priya". */
  async function undoneBy(eventId: string, rows: StoredActivity[]) {
    const undone = rows.filter((row) => row.undoneAt);
    if (!undone.length) return new Map<string, StoredActivity>();
    // Undos come after what they undo, so the event's time index bounds the search.
    const since = new Date(Math.min(...undone.map((row) => Date.parse(row.createdAt))));
    const found = await db
      .select()
      .from(activityLog)
      .where(
        and(
          eq(activityLog.eventId, eventId),
          gte(activityLog.createdAt, since),
          inArray(
            activityLog.undoOfId,
            undone.map((row) => row.id),
          ),
        ),
      );
    return new Map(found.map((row) => [row.undoOfId!, toStoredActivity(row)]));
  }

  async function toItems(
    eventId: string,
    rows: StoredActivity[],
    viewer: ActivityViewer,
  ): Promise<ActivityItem[]> {
    const [names, undos] = await Promise.all([labels(eventId, rows), undoneBy(eventId, rows)]);
    return rows.map((row) => {
      const undo = undos.get(row.id);
      return {
        id: row.id,
        createdAt: row.createdAt,
        actor: { userId: row.actorUserId, label: row.actorLabel },
        channel: row.channel,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        entityLabel: nameOf(row.after) ?? nameOf(row.before) ?? names.get(row.entityId) ?? null,
        before: (row.before as Record<string, unknown> | null) ?? null,
        after: (row.after as Record<string, unknown> | null) ?? null,
        requestId: row.requestId,
        undoOfId: row.undoOfId,
        undone:
          row.undoneAt && undo
            ? { at: row.undoneAt, byLabel: undo.actorLabel, entryId: undo.id }
            : null,
        canUndo:
          !row.undoneAt &&
          isUndoable(row) &&
          (row.actorUserId === viewer.userId || viewer.canUndoOthers),
      };
    });
  }

  return {
    /** GET E/activity: newest first, cursor-paginated (APIDesign "Pagination"). */
    async list(
      eventId: string,
      query: ActivityQuery,
      viewer: ActivityViewer,
    ): Promise<ActivityPage> {
      const filters: SQL[] = [eq(activityLog.eventId, eventId)];
      if (query.entityType) filters.push(eq(activityLog.entityType, query.entityType));
      if (query.entityId) filters.push(eq(activityLog.entityId, query.entityId));
      if (query.actor) filters.push(eq(activityLog.actorUserId, query.actor));
      if (viewer.hiddenTypes.length) {
        filters.push(notInArray(activityLog.entityType, [...viewer.hiddenTypes]));
      }
      if (query.cursor) {
        // Compared against that row in SQL, keeping Postgres's microseconds (a JS Date
        // would round them and skip or repeat rows).
        const after = decodeCursor(query.cursor);
        filters.push(
          sql`(${activityLog.createdAt}, ${activityLog.id}) < (select created_at, id from activity_log where id = ${after})`,
        );
      }
      const rows = await db
        .select()
        .from(activityLog)
        .where(and(...filters))
        .orderBy(desc(activityLog.createdAt), desc(activityLog.id))
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      const hasMore = rows.length > query.limit;
      return {
        data: await toItems(eventId, page.map(toStoredActivity), viewer),
        nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null,
        hasMore,
      };
    },

    /** The entries an undo wrote, for its response. */
    async undoEntry(eventId: string, undoOfId: string, viewer: ActivityViewer) {
      const [row] = await db
        .select()
        .from(activityLog)
        .where(
          and(
            eq(activityLog.eventId, eventId),
            eq(activityLog.undoOfId, undoOfId),
            sql`${activityLog.createdAt} >= (select created_at from activity_log where id = ${undoOfId})`,
          ),
        )
        .orderBy(desc(activityLog.createdAt))
        .limit(1);
      if (!row) return null;
      const [item] = await toItems(eventId, [toStoredActivity(row)], viewer);
      return item!;
    },
  };
}

export type ActivityQueries = ReturnType<typeof activityQueries>;
