import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';

import type { Database } from './client.js';
import { expenses } from './schema/budget.js';
import { media } from './schema/media.js';

/*
 * Retention and scans for the scheduled queue (DatabaseDesign "Retention"). Deleting expired
 * infrastructure rows isn't a domain change, so it runs here rather than as a core action;
 * anything that tells users something (due-date reminders) still goes through core.
 */

/** Rows per delete statement, so a big backlog never holds long locks or bloats one transaction. */
const BATCH = 5_000;

async function deleteInBatches(db: Database, statement: () => ReturnType<typeof sql>) {
  let total = 0;
  for (;;) {
    const result = await db.execute(statement());
    const count = result.rowCount ?? 0;
    total += count;
    if (count < BATCH) return total;
  }
}

/** Published outbox rows older than `before` (kept 7 days for debugging). */
export const deletePublishedOutbox = (db: Database, before: Date) =>
  deleteInBatches(
    db,
    () => sql`delete from outbox where id in (
      select id from outbox where published_at < ${before} limit ${BATCH})`,
  );

/** Idempotency keys past their expiry (24 hours after the request). */
export const deleteExpiredIdempotencyKeys = (db: Database, now: Date) =>
  deleteInBatches(
    db,
    () => sql`delete from idempotency_keys where (scope, key) in (
      select scope, key from idempotency_keys where expires_at < ${now} limit ${BATCH})`,
  );

/** Read notifications older than `before` (90 days); unread ones stay. */
export const deleteReadNotifications = (db: Database, before: Date) =>
  deleteInBatches(
    db,
    () => sql`delete from notifications where id in (
      select id from notifications
      where read_at is not null and created_at < ${before} limit ${BATCH})`,
  );

export interface DueScanTarget {
  eventId: string;
  /** The event's local date, YYYY-MM-DD. */
  dueOn: string;
}

/**
 * Events where it is now at least `fromHour` o'clock locally and some unfinished, assigned
 * task is due today (local date). The scan runs every half hour; dedupe keys make repeats
 * harmless, and the hour keeps reminders out of the night.
 */
export async function eventsWithTasksDue(
  db: Database,
  now: Date,
  fromHour = 8,
): Promise<DueScanTarget[]> {
  const result = await db.execute<{ event_id: string; due_on: string }>(sql`
    select e.id as event_id, to_char((${now}::timestamptz at time zone e.time_zone)::date, 'YYYY-MM-DD') as due_on
    from events e
    where e.deleted_at is null
      and e.status not in ('completed', 'archived')
      and extract(hour from ${now}::timestamptz at time zone e.time_zone) >= ${fromHour}
      and exists (
        select 1 from tasks t
        join task_assignees ta on ta.task_id = t.id
        where t.event_id = e.id
          and t.deleted_at is null
          and t.status <> 'done'
          and t.due_on = (${now}::timestamptz at time zone e.time_zone)::date
      )
    order by e.id`);
  return result.rows.map((row) => ({ eventId: row.event_id, dueOn: row.due_on }));
}

/** A media row's files in storage, for the worker to delete. */
export interface StoredFiles {
  id: string;
  bucket: 'public' | 'private';
  keys: string[];
}

const filesOf = (row: { id: string; bucket: string; storageKey: string; variants: unknown }) => ({
  id: row.id,
  bucket: row.bucket as StoredFiles['bucket'],
  keys: [...new Set([row.storageKey, ...Object.values(row.variants as Record<string, string>)])],
});

/**
 * Upload tickets never confirmed (the browser gave up), and files deleted over 30 days ago
 * (DatabaseDesign "media": removed from storage 30 days later). Up to `limit` at a time; the
 * worker deletes their files, then `forgetMedia` their rows.
 */
export async function mediaToRemove(db: Database, now: Date, limit = 500): Promise<StoredFiles[]> {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: media.id,
      bucket: media.bucket,
      storageKey: media.storageKey,
      variants: media.variants,
    })
    .from(media)
    .where(
      or(and(isNull(media.uploadedAt), lt(media.createdAt, dayAgo)), lt(media.deletedAt, monthAgo)),
    )
    .limit(limit);
  return rows.map(filesOf);
}

/** Removes media rows whose files are gone; an expense keeping one as its receipt lets go. */
export async function forgetMedia(db: Database, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  return db.transaction(async (tx) => {
    await tx
      .update(expenses)
      .set({ receiptMediaId: null })
      .where(inArray(expenses.receiptMediaId, ids));
    const rows = await tx.delete(media).where(inArray(media.id, ids)).returning({ id: media.id });
    return rows.length;
  });
}

/** A media row's files, deleted or not (purging a deleted photo's files). */
export async function mediaFiles(
  db: Database,
  eventId: string,
  mediaId: string,
): Promise<StoredFiles | null> {
  const [row] = await db
    .select({
      id: media.id,
      bucket: media.bucket,
      storageKey: media.storageKey,
      variants: media.variants,
    })
    .from(media)
    .where(and(eq(media.eventId, eventId), eq(media.id, mediaId)));
  return row ? filesOf(row) : null;
}
