import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { valueSetCheck } from '../check.js';
import { bytea, id, timestamps } from './columns.js';
import { events, subEvents } from './events.js';
import { contacts, households } from './guests.js';
import { members } from './team.js';

/**
 * DatabaseDesign "invitations". The link token is derived (HMAC of id and token_version), so
 * only its SHA-256 is stored; regenerating bumps token_version.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: id(),
    eventId: uuid()
      .notNull()
      .references(() => events.id),
    householdId: uuid(),
    contactId: uuid(),
    tokenHash: bytea().notNull(),
    tokenVersion: integer().notNull().default(1),
    deliveryStatus: text().notNull().default('not_sent'),
    distributorMemberId: uuid(),
    sentAt: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),
    /** Updated at most once an hour per link. */
    lastOpenedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    version: integer().notNull().default(1),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique('invitations_event_id_id_unique').on(t.eventId, t.id),
    uniqueIndex('invitations_token_hash_unique').on(t.tokenHash),
    // One live invitation per guest.
    uniqueIndex('invitations_event_household_unique')
      .on(t.eventId, t.householdId)
      .where(sql`${t.deletedAt} is null and ${t.householdId} is not null`),
    uniqueIndex('invitations_event_contact_unique')
      .on(t.eventId, t.contactId)
      .where(sql`${t.deletedAt} is null and ${t.contactId} is not null`),
    index('invitations_event_delivery_idx').on(t.eventId, t.deliveryStatus),
    index('invitations_distributor_idx').on(t.distributorMemberId),
    foreignKey({
      name: 'invitations_household_fk',
      columns: [t.eventId, t.householdId],
      foreignColumns: [households.eventId, households.id],
    }),
    foreignKey({
      name: 'invitations_contact_fk',
      columns: [t.eventId, t.contactId],
      foreignColumns: [contacts.eventId, contacts.id],
    }),
    foreignKey({
      name: 'invitations_distributor_fk',
      columns: [t.eventId, t.distributorMemberId],
      foreignColumns: [members.eventId, members.id],
    }),
    check('invitations_one_guest_check', sql`num_nonnulls(${t.householdId}, ${t.contactId}) = 1`),
    valueSetCheck('invitations_delivery_status_check', t.deliveryStatus, 'deliveryStatus'),
  ],
);

/** DatabaseDesign "invitation_sub_events": which sub-events, when guests are per sub-event. */
export const invitationSubEvents = pgTable(
  'invitation_sub_events',
  {
    invitationId: uuid().notNull(),
    eventId: uuid().notNull(),
    subEventId: uuid().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.invitationId, t.subEventId] }),
    index('invitation_sub_events_sub_event_idx').on(t.subEventId),
    foreignKey({
      name: 'invitation_sub_events_invitation_fk',
      columns: [t.eventId, t.invitationId],
      foreignColumns: [invitations.eventId, invitations.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'invitation_sub_events_sub_event_fk',
      columns: [t.eventId, t.subEventId],
      foreignColumns: [subEvents.eventId, subEvents.id],
    }).onDelete('cascade'),
  ],
);

/**
 * DatabaseDesign "attendance": every headcount comes from here. One row per guest for the
 * whole event (sub_event_id null) or per sub-event. No soft delete: a guest taken off a
 * sub-event is cancelled, keeping history and undo.
 */
export const attendance = pgTable(
  'attendance',
  {
    id: id(),
    eventId: uuid()
      .notNull()
      .references(() => events.id),
    subEventId: uuid(),
    householdId: uuid(),
    contactId: uuid(),
    invitationId: uuid(),
    source: text().notNull(),
    status: text().notNull(),
    partySize: smallint().notNull().default(1),
    /** Standard fields now, form-builder answers in V2. */
    answers: jsonb().notNull().default({}),
    respondedAt: timestamp({ withTimezone: true }),
    /** V2 check-in. */
    qrTokenHash: bytea(),
    checkedInAt: timestamp({ withTimezone: true }),
    checkedInByMemberId: uuid(),
    version: integer().notNull().default(1),
    ...timestamps(),
  },
  (t) => [
    unique('attendance_event_id_id_unique').on(t.eventId, t.id),
    // One row per guest per scope: an RSVP resubmit updates the same row.
    unique('attendance_guest_scope_unique')
      .on(t.eventId, t.subEventId, t.householdId, t.contactId)
      .nullsNotDistinct(),
    index('attendance_event_sub_event_status_idx').on(t.eventId, t.subEventId, t.status),
    uniqueIndex('attendance_qr_token_hash_unique')
      .on(t.qrTokenHash)
      .where(sql`${t.qrTokenHash} is not null`),
    foreignKey({
      name: 'attendance_sub_event_fk',
      columns: [t.eventId, t.subEventId],
      foreignColumns: [subEvents.eventId, subEvents.id],
    }),
    foreignKey({
      name: 'attendance_household_fk',
      columns: [t.eventId, t.householdId],
      foreignColumns: [households.eventId, households.id],
    }),
    foreignKey({
      name: 'attendance_contact_fk',
      columns: [t.eventId, t.contactId],
      foreignColumns: [contacts.eventId, contacts.id],
    }),
    foreignKey({
      name: 'attendance_invitation_fk',
      columns: [t.eventId, t.invitationId],
      foreignColumns: [invitations.eventId, invitations.id],
    }),
    foreignKey({
      name: 'attendance_checked_in_by_fk',
      columns: [t.eventId, t.checkedInByMemberId],
      foreignColumns: [members.eventId, members.id],
    }),
    check('attendance_one_guest_check', sql`num_nonnulls(${t.householdId}, ${t.contactId}) = 1`),
    check(
      'attendance_invited_check',
      sql`${t.source} <> 'invited' or ${t.invitationId} is not null`,
    ),
    check('attendance_party_size_check', sql`${t.partySize} between 1 and 50`),
    valueSetCheck('attendance_source_check', t.source, 'attendanceSource'),
    valueSetCheck('attendance_status_check', t.status, 'attendanceStatus'),
  ],
);
