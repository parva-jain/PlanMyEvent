import { sql } from 'drizzle-orm';
import { bigint, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Side effects written in the same transaction as the change, then relayed to BullMQ by the
 * worker (DatabaseDesign "outbox", SystemDesign 5.1). No foreign keys, so deleting an event
 * never blocks on in-flight side effects.
 */
export const outbox = pgTable(
  'outbox',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    eventId: uuid(),
    topic: text().notNull(),
    /** Becomes the BullMQ job id (decision 005: parts joined with '-'). */
    dedupeKey: text().notNull(),
    payload: jsonb().notNull(),
    availableAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    attempts: integer().notNull().default(0),
    lastError: text(),
    publishedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  // The relay's only query: unpublished rows that are due, in order.
  (t) => [
    index('outbox_unpublished_idx')
      .on(t.availableAt, t.id)
      .where(sql`${t.publishedAt} is null`),
  ],
);
