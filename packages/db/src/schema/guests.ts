import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  smallint,
  type PgTableExtraConfigValue,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { citext, id, timestamps } from './columns.js';
import { events } from './events.js';

/** DatabaseDesign "households". */
export const households = pgTable(
  'households',
  {
    id: id(),
    eventId: uuid()
      .notNull()
      .references(() => events.id),
    name: text().notNull(),
    expectedCount: smallint().notNull().default(1),
    /** Whose phone gets the invitation; one of its contacts (core keeps it so). */
    primaryContactId: uuid(),
    version: integer().notNull().default(1),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  // Typed, so the reference to contacts (and back) doesn't make the types circular.
  (t): PgTableExtraConfigValue[] => [
    unique('households_event_id_id_unique').on(t.eventId, t.id),
    index('households_event_idx')
      .on(t.eventId)
      .where(sql`${t.deletedAt} is null`),
    index('households_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
    // Circular with contacts: drizzle-kit adds it after both tables exist.
    foreignKey({
      name: 'households_primary_contact_fk',
      columns: [t.eventId, t.primaryContactId],
      foreignColumns: [contacts.eventId, contacts.id],
    }),
    check('households_expected_count_check', sql`${t.expectedCount} between 1 and 50`),
  ],
);

/** DatabaseDesign "contacts". Phone and email aren't unique: families share them. */
export const contacts = pgTable(
  'contacts',
  {
    id: id(),
    eventId: uuid()
      .notNull()
      .references(() => events.id),
    householdId: uuid(),
    name: text().notNull(),
    /** E.164, normalized by core. */
    phone: text(),
    email: citext(),
    tags: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    notes: text(),
    version: integer().notNull().default(1),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique('contacts_event_id_id_unique').on(t.eventId, t.id),
    index('contacts_event_household_idx').on(t.eventId, t.householdId),
    index('contacts_tags_idx').using('gin', t.tags),
    index('contacts_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
    // Duplicate detection on import.
    index('contacts_event_phone_idx').on(t.eventId, t.phone),
    index('contacts_event_email_idx').on(t.eventId, t.email),
    foreignKey({
      name: 'contacts_household_fk',
      columns: [t.eventId, t.householdId],
      foreignColumns: [households.eventId, households.id],
    }),
  ],
);
