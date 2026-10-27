import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { valueSetCheck } from '../check.js';
import { users } from './auth.js';
import { id, timestamps } from './columns.js';
import { workspaces } from './workspaces.js';

const deletedAt = () => timestamp({ withTimezone: true });

/** The tenant root (DatabaseDesign "events"). Every event-owned row carries its id. */
export const events = pgTable(
  'events',
  {
    id: id(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id),
    ownerUserId: uuid()
      .notNull()
      .references(() => users.id),
    type: text().notNull(),
    name: text().notNull(),
    slug: text().notNull().unique(),
    description: text(),
    // cover_media_id arrives with the media table (milestone 8).
    startsOn: date({ mode: 'string' }).notNull(),
    endsOn: date({ mode: 'string' }).notNull(),
    timeZone: text().notNull().default('Asia/Kolkata'),
    status: text().notNull().default('draft'),
    guestScope: text().notNull().default('whole_event'),
    responseMode: text().notNull().default('invite_only'),
    rolesVersion: integer().notNull().default(1),
    contentVersion: integer().notNull().default(1),
    budgetPaise: bigint({ mode: 'number' }),
    settings: jsonb().notNull().default({}),
    version: integer().notNull().default(1),
    deletedAt: deletedAt(),
    ...timestamps(),
  },
  (t) => [
    index('events_workspace_status_idx')
      .on(t.workspaceId, t.status)
      .where(sql`${t.deletedAt} is null`),
    index('events_owner_user_id_idx').on(t.ownerUserId),
    valueSetCheck('events_type_check', t.type, 'eventType'),
    valueSetCheck('events_status_check', t.status, 'eventStatus'),
    valueSetCheck('events_guest_scope_check', t.guestScope, 'guestScope'),
    valueSetCheck('events_response_mode_check', t.responseMode, 'responseMode'),
    check('events_dates_check', sql`${t.endsOn} >= ${t.startsOn}`),
    check('events_slug_check', sql`${t.slug} ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'`),
    check('events_budget_check', sql`${t.budgetPaise} >= 0`),
  ],
);

/** Which modules an event uses (PK (event_id, module), no id). */
export const eventModules = pgTable(
  'event_modules',
  {
    eventId: uuid()
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    module: text().notNull(),
    enabled: boolean().notNull(),
    config: jsonb().notNull().default({}),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.module] }),
    valueSetCheck('event_modules_module_check', t.module, 'module'),
  ],
);

export const venues = pgTable(
  'venues',
  {
    id: id(),
    eventId: uuid()
      .notNull()
      .references(() => events.id),
    name: text().notNull(),
    address: text(),
    mapUrl: text(),
    deletedAt: deletedAt(),
    ...timestamps(),
  },
  (t) => [
    index('venues_event_id_idx').on(t.eventId),
    // Target of composite foreign keys: children reference (event_id, id).
    unique('venues_event_id_id_unique').on(t.eventId, t.id),
  ],
);

export const subEvents = pgTable(
  'sub_events',
  {
    id: id(),
    eventId: uuid()
      .notNull()
      .references(() => events.id),
    name: text().notNull(),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    venueId: uuid(),
    capacity: integer(),
    visibility: text().notNull().default('invite_only'),
    responseMode: text(),
    groupLabel: text(),
    notes: text(),
    position: integer().notNull().default(0),
    version: integer().notNull().default(1),
    deletedAt: deletedAt(),
    ...timestamps(),
  },
  (t) => [
    index('sub_events_event_starts_idx')
      .on(t.eventId, t.startsAt)
      .where(sql`${t.deletedAt} is null`),
    unique('sub_events_event_id_id_unique').on(t.eventId, t.id),
    // The venue must belong to the same event (DatabaseDesign "composite foreign keys").
    foreignKey({
      name: 'sub_events_venue_fk',
      columns: [t.eventId, t.venueId],
      foreignColumns: [venues.eventId, venues.id],
    }),
    check('sub_events_times_check', sql`${t.endsAt} > ${t.startsAt}`),
    check('sub_events_capacity_check', sql`${t.capacity} > 0`),
    valueSetCheck('sub_events_visibility_check', t.visibility, 'visibility'),
    valueSetCheck('sub_events_response_mode_check', t.responseMode, 'responseMode'),
  ],
);
