import type { Channel } from '@pme/contracts';
import type { ActivityStore, StoredActivity } from '@pme/core';
import { and, eq, isNull, sql } from 'drizzle-orm';

import type { Database } from '../client.js';
import type { DrizzleTx } from '../runtime.js';
import { activityLog } from '../schema/activity.js';

type Queryable = Database | DrizzleTx;
type ActivityRow = typeof activityLog.$inferSelect;

export function toStoredActivity(row: ActivityRow): StoredActivity {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    eventId: row.eventId,
    actorUserId: row.actorUserId,
    actorLabel: row.actorLabel,
    channel: row.channel as Channel,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    before: row.before,
    after: row.after,
    requestId: row.requestId,
    undoOfId: row.undoOfId,
    undoneAt: row.undoneAt?.toISOString() ?? null,
  };
}

export function activityStore(db: Queryable): ActivityStore {
  const byId = (eventId: string, entryId: string) =>
    and(eq(activityLog.eventId, eventId), eq(activityLog.id, entryId));
  return {
    async insert(rows) {
      if (!rows.length) return [];
      // clock_timestamp(): entries of one transaction keep their order in the feed.
      const inserted = await db
        .insert(activityLog)
        .values(rows.map((row) => ({ ...row, createdAt: sql`clock_timestamp()` })))
        .returning();
      return inserted.map(toStoredActivity);
    },
    async lockForUndo(eventId, entryId) {
      const [row] = await db.select().from(activityLog).where(byId(eventId, entryId)).for('update');
      return row ? toStoredActivity(row) : null;
    },
    async markUndone(eventId, entryId) {
      const rows = await db
        .update(activityLog)
        .set({ undoneAt: sql`now()` })
        .where(and(byId(eventId, entryId), isNull(activityLog.undoneAt)))
        .returning({ id: activityLog.id });
      return rows.length > 0;
    },
  };
}
