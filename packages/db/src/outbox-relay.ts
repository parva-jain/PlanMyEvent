import { and, asc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';

import type { Database } from './client.js';
import { outbox } from './schema/outbox.js';

export interface OutboxRow {
  id: number;
  eventId: string | null;
  topic: string;
  dedupeKey: string;
  payload: unknown;
  attempts: number;
}

export interface RelayOptions {
  batchSize: number;
  /** Only these topics; others stay untouched (a newer deploy may know them). */
  topics: readonly string[];
  /** Publishes one row (e.g. adds a BullMQ job); throwing leaves the row for a retry. */
  publish: (row: OutboxRow) => Promise<void>;
  /** Rows whose payload holds a secret are deleted once published instead of kept 7 days. */
  isSensitive: (topic: string) => boolean;
  /** Delay before retrying a row that failed `attempts` times. */
  retryDelayMs: (attempts: number) => number;
}

export interface RelayResult {
  published: number;
  failed: number;
}

/**
 * One relay pass (SystemDesign 5.1): claims due, unpublished rows with FOR UPDATE SKIP
 * LOCKED, so several relays never take the same row, publishes them in id order, and marks
 * the outcome in the same transaction. Delivery is at-least-once: a crash after publishing
 * but before commit re-publishes, which deterministic job ids make harmless.
 */
export async function relayOutboxBatch(db: Database, options: RelayOptions): Promise<RelayResult> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: outbox.id,
        eventId: outbox.eventId,
        topic: outbox.topic,
        dedupeKey: outbox.dedupeKey,
        payload: outbox.payload,
        attempts: outbox.attempts,
      })
      .from(outbox)
      .where(
        and(
          isNull(outbox.publishedAt),
          lte(outbox.availableAt, sql`now()`),
          inArray(outbox.topic, [...options.topics]),
        ),
      )
      .orderBy(asc(outbox.availableAt), asc(outbox.id))
      .limit(options.batchSize)
      .for('update', { skipLocked: true });

    const done: OutboxRow[] = [];
    let failed = 0;
    for (const row of rows) {
      try {
        await options.publish(row);
        done.push(row);
      } catch (error) {
        failed += 1;
        const attempts = row.attempts + 1;
        await tx
          .update(outbox)
          .set({
            attempts,
            lastError: error instanceof Error ? error.message : String(error),
            availableAt: sql`now() + ${options.retryDelayMs(attempts)} * interval '1 millisecond'`,
          })
          .where(eq(outbox.id, row.id));
      }
    }

    const sensitive = done.filter((row) => options.isSensitive(row.topic)).map((row) => row.id);
    const kept = done.filter((row) => !options.isSensitive(row.topic)).map((row) => row.id);
    if (sensitive.length) {
      await tx.delete(outbox).where(inArray(outbox.id, sensitive));
    }
    if (kept.length) {
      await tx
        .update(outbox)
        .set({ publishedAt: sql`now()` })
        .where(inArray(outbox.id, kept));
    }
    return { published: done.length, failed };
  });
}
