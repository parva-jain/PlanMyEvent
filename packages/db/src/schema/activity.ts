import {
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { valueSetCheck } from '../check.js';
import { newId } from '../uuid.js';
import { users } from './auth.js';
import { events } from './events.js';

/**
 * Append-only log of every change (DatabaseDesign "activity_log"). The primary key starts
 * with created_at so the table can become monthly range partitions without changing it.
 * Rows are never edited except undone_at.
 */
export const activityLog = pgTable(
  'activity_log',
  {
    id: uuid()
      .notNull()
      .$defaultFn(() => newId()),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    eventId: uuid()
      .notNull()
      .references(() => events.id),
    actorUserId: uuid().references(() => users.id),
    actorLabel: text().notNull(),
    channel: text().notNull(),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: uuid().notNull(),
    before: jsonb(),
    after: jsonb(),
    requestId: text(),
    undoOfId: uuid(),
    undoneAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    primaryKey({ name: 'activity_log_pkey', columns: [t.createdAt, t.id] }),
    // Undo and "undone by" find an entry by id; the primary key starts with created_at.
    uniqueIndex('activity_log_id_unique').on(t.id),
    // The feed, newest first.
    index('activity_log_event_created_idx').on(t.eventId, t.createdAt.desc()),
    // One entity's history and undo checks.
    index('activity_log_entity_idx').on(t.entityType, t.entityId, t.createdAt.desc()),
    valueSetCheck('activity_log_channel_check', t.channel, 'channel'),
  ],
);
