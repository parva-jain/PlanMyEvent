import {
  NotificationDataSchema,
  type Notification,
  type NotificationPage,
  type NotificationQuery,
} from '@pme/contracts';
import { and, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';

import type { Database } from '../client.js';
import { users } from '../schema/auth.js';
import { events } from '../schema/events.js';
import { notifications } from '../schema/notifications.js';
import { decodeCursor, encodeCursor } from './cursor.js';

/** Notification reads for the API; always for the signed-in user only. */
export function notificationQueries(db: Database) {
  async function unreadCount(userId: string) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return row?.count ?? 0;
  }

  return {
    unreadCount,

    /** Newest first (UUIDv7 ids sort by time); event names and actors as they are now. */
    async list(userId: string, query: NotificationQuery): Promise<NotificationPage> {
      const conditions = [eq(notifications.userId, userId)];
      if (query.unread) conditions.push(isNull(notifications.readAt));
      if (query.cursor) {
        const lastId = decodeCursor(query.cursor);
        const [last] = await db
          .select({ createdAt: notifications.createdAt })
          .from(notifications)
          .where(and(eq(notifications.userId, userId), eq(notifications.id, lastId)));
        if (last) {
          conditions.push(
            or(
              lt(notifications.createdAt, last.createdAt),
              and(eq(notifications.createdAt, last.createdAt), lt(notifications.id, lastId)),
            )!,
          );
        }
      }
      const rows = await db
        .select({
          id: notifications.id,
          type: notifications.type,
          payload: notifications.payload,
          readAt: notifications.readAt,
          createdAt: notifications.createdAt,
          eventId: events.id,
          eventName: events.name,
        })
        .from(notifications)
        // Deleted events drop out of the list rather than linking nowhere.
        .leftJoin(events, eq(events.id, notifications.eventId))
        .where(and(...conditions, or(isNull(notifications.eventId), isNull(events.deletedAt))))
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);

      const actorIds = [
        ...new Set(
          page.flatMap((row) => {
            const actor = (row.payload as { actorUserId?: unknown }).actorUserId;
            return typeof actor === 'string' ? [actor] : [];
          }),
        ),
      ];
      const actors = new Map(
        actorIds.length
          ? (
              await db
                .select({ id: users.id, name: users.name, email: users.email })
                .from(users)
                .where(inArray(users.id, actorIds))
            ).map((user) => [user.id, user.name.trim() || user.email.split('@')[0]!])
          : [],
      );

      const data = page.flatMap((row): Notification[] => {
        // A payload a newer deploy wrote in a shape this one doesn't know is left out.
        const parsed = NotificationDataSchema.safeParse({ type: row.type, data: row.payload });
        if (!parsed.success) return [];
        const actorUserId = 'actorUserId' in parsed.data.data ? parsed.data.data.actorUserId : null;
        const actorName = actorUserId ? actors.get(actorUserId) : undefined;
        return [
          {
            ...parsed.data,
            id: row.id,
            createdAt: row.createdAt.toISOString(),
            readAt: row.readAt?.toISOString() ?? null,
            event: row.eventId && row.eventName ? { id: row.eventId, name: row.eventName } : null,
            actor: actorUserId && actorName ? { userId: actorUserId, name: actorName } : null,
          },
        ];
      });
      const hasMore = rows.length > query.limit;
      return {
        data,
        hasMore,
        nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null,
        unreadCount: await unreadCount(userId),
      };
    },
  };
}

export type NotificationQueries = ReturnType<typeof notificationQueries>;
