import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { valueSetCheck } from '../check.js';
import { users } from './auth.js';
import { id } from './columns.js';
import { events } from './events.js';

/**
 * In-app notifications, per user across events (DatabaseDesign "notifications"). Written by
 * core actions in the same transaction as the change; read ones older than 90 days are
 * deleted by the scheduled queue.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    eventId: uuid().references(() => events.id, { onDelete: 'cascade' }),
    type: text().notNull(),
    payload: jsonb().notNull(),
    /**
     * Set for notifications a scan may try to send twice (task_due-<taskId>-<dueOn>), so a
     * repeated scan inserts nothing.
     */
    dedupeKey: text(),
    readAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('notifications_user_created_idx').on(t.userId, t.createdAt.desc(), t.id.desc()),
    index('notifications_unread_idx')
      .on(t.userId)
      .where(sql`${t.readAt} is null`),
    uniqueIndex('notifications_dedupe_idx')
      .on(t.userId, t.dedupeKey)
      .where(sql`${t.dedupeKey} is not null`),
    index('notifications_event_id_idx').on(t.eventId),
    valueSetCheck('notifications_type_check', t.type, 'notificationType'),
  ],
);
