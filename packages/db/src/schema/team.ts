import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { valueSetCheck } from '../check.js';
import { users } from './auth.js';
import { bytea, citext, id, timestamps } from './columns.js';
import { events, subEvents } from './events.js';

/*
 * Team and permissions (DatabaseDesign "Team and permissions"). A member holds roles through
 * role_assignments; an assignment with no scope rows covers the whole event, each scope row
 * narrows it to one sub-event. Composite foreign keys keep member, role and sub-event inside
 * one event.
 */

export const members = pgTable(
  'members',
  {
    id: id(),
    eventId: uuid()
      .notNull()
      .references(() => events.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    status: text().notNull().default('active'),
    /** Verified WhatsApp number for the V2 bot. */
    phone: text(),
    invitedByUserId: uuid().references(() => users.id),
    joinedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp({ withTimezone: true }),
    version: integer().notNull().default(1),
    ...timestamps(),
  },
  (t) => [
    unique('members_event_user_unique').on(t.eventId, t.userId),
    unique('members_event_id_id_unique').on(t.eventId, t.id),
    // "My events".
    index('members_user_id_idx').on(t.userId),
    valueSetCheck('members_status_check', t.status, 'memberStatus'),
  ],
);

export const roles = pgTable(
  'roles',
  {
    id: id(),
    eventId: uuid()
      .notNull()
      .references(() => events.id),
    name: text().notNull(),
    description: text(),
    /** Created from the template; still editable except Owner. */
    isStandard: boolean().notNull().default(false),
    /** The single Owner role; immutable. */
    isOwner: boolean().notNull().default(false),
    /** Values from the permission catalog in @pme/contracts; core rejects unknown ones. */
    permissions: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    version: integer().notNull().default(1),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('roles_event_name_unique')
      .on(t.eventId, sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
    // Exactly one Owner role per event.
    uniqueIndex('roles_event_owner_unique')
      .on(t.eventId)
      .where(sql`${t.isOwner}`),
    unique('roles_event_id_id_unique').on(t.eventId, t.id),
  ],
);

export const roleAssignments = pgTable(
  'role_assignments',
  {
    id: id(),
    eventId: uuid().notNull(),
    memberId: uuid().notNull(),
    roleId: uuid().notNull(),
    grantedByUserId: uuid().references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'role_assignments_member_fk',
      columns: [t.eventId, t.memberId],
      foreignColumns: [members.eventId, members.id],
    }).onDelete('cascade'),
    // Restrict: a role in use can't be hard-deleted.
    foreignKey({
      name: 'role_assignments_role_fk',
      columns: [t.eventId, t.roleId],
      foreignColumns: [roles.eventId, roles.id],
    }).onDelete('restrict'),
    unique('role_assignments_member_role_unique').on(t.memberId, t.roleId),
    index('role_assignments_event_member_idx').on(t.eventId, t.memberId),
    index('role_assignments_role_id_idx').on(t.roleId),
  ],
);

export const roleAssignmentScopes = pgTable(
  'role_assignment_scopes',
  {
    roleAssignmentId: uuid()
      .notNull()
      .references(() => roleAssignments.id, { onDelete: 'cascade' }),
    eventId: uuid().notNull(),
    subEventId: uuid().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.roleAssignmentId, t.subEventId] }),
    foreignKey({
      name: 'role_assignment_scopes_sub_event_fk',
      columns: [t.eventId, t.subEventId],
      foreignColumns: [subEvents.eventId, subEvents.id],
    }).onDelete('cascade'),
    index('role_assignment_scopes_sub_event_id_idx').on(t.subEventId),
  ],
);

export const memberInvites = pgTable(
  'member_invites',
  {
    id: id(),
    eventId: uuid()
      .notNull()
      .references(() => events.id),
    /** SHA-256 of the link token; the token itself is shown once (CLAUDE.md rule 6). */
    tokenHash: bytea().notNull().unique(),
    /** Set for email invites; null for shareable links. */
    email: citext(),
    /** [{ roleId, subEventIds }] applied on accept, re-validated then. */
    grants: jsonb().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    maxUses: integer().notNull().default(1),
    usedCount: integer().notNull().default(0),
    revokedAt: timestamp({ withTimezone: true }),
    createdByUserId: uuid()
      .notNull()
      .references(() => users.id),
    ...timestamps(),
  },
  (t) => [
    index('member_invites_event_id_idx').on(t.eventId),
    check('member_invites_max_uses_check', sql`${t.maxUses} > 0`),
    check('member_invites_used_count_check', sql`${t.usedCount} <= ${t.maxUses}`),
  ],
);
