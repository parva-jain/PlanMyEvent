import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { valueSetCheck } from '../check.js';
import { id, timestamps } from './columns.js';
import { events, subEvents } from './events.js';
import { members } from './team.js';

/** DatabaseDesign "budget_categories". */
export const budgetCategories = pgTable(
  'budget_categories',
  {
    id: id(),
    eventId: uuid()
      .notNull()
      .references(() => events.id),
    name: text().notNull(),
    plannedPaise: bigint({ mode: 'number' }).notNull().default(0),
    position: integer().notNull().default(0),
    version: integer().notNull().default(1),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('budget_categories_event_name_unique')
      .on(t.eventId, sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} is null`),
    unique('budget_categories_event_id_id_unique').on(t.eventId, t.id),
    check('budget_categories_planned_check', sql`${t.plannedPaise} >= 0`),
  ],
);

/**
 * DatabaseDesign "expenses". receipt_media_id arrives with the media table (milestone 8);
 * vendor_name gives way to vendor_id in V2.
 */
export const expenses = pgTable(
  'expenses',
  {
    id: id(),
    eventId: uuid()
      .notNull()
      .references(() => events.id),
    categoryId: uuid().notNull(),
    subEventId: uuid(),
    title: text().notNull(),
    vendorName: text(),
    amountPaise: bigint({ mode: 'number' }).notNull(),
    paidPaise: bigint({ mode: 'number' }).notNull().default(0),
    paymentStatus: text().notNull().default('planned'),
    dueOn: date({ mode: 'string' }),
    paidOn: date({ mode: 'string' }),
    paidByMemberId: uuid(),
    transactionRef: text(),
    notes: text(),
    version: integer().notNull().default(1),
    deletedAt: timestamp({ withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique('expenses_event_id_id_unique').on(t.eventId, t.id),
    index('expenses_event_category_idx')
      .on(t.eventId, t.categoryId)
      .where(sql`${t.deletedAt} is null`),
    index('expenses_event_status_due_idx')
      .on(t.eventId, t.paymentStatus, t.dueOn)
      .where(sql`${t.deletedAt} is null`),
    // Blocks recording the same UPI or bank payment twice.
    uniqueIndex('expenses_event_transaction_ref_unique')
      .on(t.eventId, t.transactionRef)
      .where(sql`${t.transactionRef} is not null and ${t.deletedAt} is null`),
    foreignKey({
      name: 'expenses_category_fk',
      columns: [t.eventId, t.categoryId],
      foreignColumns: [budgetCategories.eventId, budgetCategories.id],
    }),
    foreignKey({
      name: 'expenses_sub_event_fk',
      columns: [t.eventId, t.subEventId],
      foreignColumns: [subEvents.eventId, subEvents.id],
    }),
    foreignKey({
      name: 'expenses_paid_by_member_fk',
      columns: [t.eventId, t.paidByMemberId],
      foreignColumns: [members.eventId, members.id],
    }),
    check('expenses_amount_check', sql`${t.amountPaise} > 0`),
    check('expenses_paid_check', sql`${t.paidPaise} >= 0 and ${t.paidPaise} <= ${t.amountPaise}`),
    // DatabaseDesign "Status consistency check".
    check(
      'expenses_status_amounts_check',
      sql`case ${t.paymentStatus}
        when 'planned' then ${t.paidPaise} = 0
        when 'paid' then ${t.paidPaise} = ${t.amountPaise}
        else ${t.paidPaise} > 0 and ${t.paidPaise} < ${t.amountPaise} end`,
    ),
    valueSetCheck('expenses_payment_status_check', t.paymentStatus, 'paymentStatus'),
  ],
);
