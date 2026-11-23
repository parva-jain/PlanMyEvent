import type { NotificationStore } from '@pme/core';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import type { DrizzleTx } from '../runtime.js';
import { notifications } from '../schema/notifications.js';

const unreadOf = (userId: string) =>
  and(eq(notifications.userId, userId), isNull(notifications.readAt));

/** DatabaseDesign "notifications": written inside the action's transaction. */
export function notificationStore(db: DrizzleTx): NotificationStore {
  return {
    async insert(list) {
      if (!list.length) return [];
      const rows = await db
        .insert(notifications)
        .values(
          list.map((item) => ({
            userId: item.userId,
            eventId: item.eventId,
            type: item.type,
            payload: item.data,
            dedupeKey: item.dedupeKey ?? null,
          })),
        )
        // A repeated scan finds the reminder already there (partial unique index).
        .onConflictDoNothing({
          target: [notifications.userId, notifications.dedupeKey],
          where: sql`${notifications.dedupeKey} is not null`,
        })
        .returning({
          id: notifications.id,
          userId: notifications.userId,
          type: notifications.type,
        });
      return rows.map((row) => ({ ...row, type: row.type as (typeof list)[number]['type'] }));
    },
    async markRead(userId, ids, now) {
      const rows = await db
        .update(notifications)
        .set({ readAt: now })
        .where(
          ids === null ? unreadOf(userId) : and(unreadOf(userId), inArray(notifications.id, ids)),
        )
        .returning({ id: notifications.id });
      return rows.length;
    },
    async unreadCount(userId) {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(unreadOf(userId));
      return row?.count ?? 0;
    },
  };
}
