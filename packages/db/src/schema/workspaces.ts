import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { valueSetCheck } from '../check.js';
import { users } from './auth.js';
import { id, timestamps } from './columns.js';

/** Every user gets one hidden personal workspace; all their events belong to it (PRD 1). */
export const workspaces = pgTable(
  'workspaces',
  {
    id: id(),
    name: text().notNull(),
    ownerUserId: uuid()
      .notNull()
      .references(() => users.id),
    isPersonal: boolean().notNull().default(true),
    plan: text().notNull().default('free'),
    version: integer().notNull().default(1),
    ...timestamps(),
  },
  (t) => [
    index('workspaces_owner_user_id_idx').on(t.ownerUserId),
    // Exactly one personal workspace per user; also what makes creating it idempotent.
    uniqueIndex('workspaces_one_personal_per_user')
      .on(t.ownerUserId)
      .where(sql`${t.isPersonal}`),
    valueSetCheck('workspaces_plan_check', t.plan, 'plan'),
  ],
);
