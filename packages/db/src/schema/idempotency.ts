import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  index,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

/** Stored POST outcomes for Idempotency-Key replays (DatabaseDesign "idempotency_keys"). */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    /** user:<userId> for members; invite:/ip: scopes arrive with public routes. */
    scope: text().notNull(),
    key: text().notNull(),
    requestHash: bytea().notNull(),
    status: text().notNull(),
    responseStatus: smallint(),
    responseBody: jsonb(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.scope, t.key] }),
    index('idempotency_keys_expires_at_idx').on(t.expiresAt),
    check('idempotency_keys_status_check', sql`${t.status} in ('in_progress', 'completed')`),
  ],
);
