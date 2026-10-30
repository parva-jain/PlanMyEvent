import type { BudgetCategory, Expense } from '@pme/contracts';
import type { BudgetCategoryStore, ExpenseStore } from '@pme/core';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';

import type { Database } from '../client.js';
import type { DrizzleTx } from '../runtime.js';
import { budgetCategories, expenses } from '../schema/budget.js';
import { isUniqueViolation } from './events.js';

type Queryable = Database | DrizzleTx;
type CategoryRow = typeof budgetCategories.$inferSelect;
type ExpenseRow = typeof expenses.$inferSelect;

export const toBudgetCategory = (row: CategoryRow): BudgetCategory => ({
  id: row.id,
  name: row.name,
  plannedPaise: row.plannedPaise,
  position: row.position,
  version: row.version,
});

export const toExpense = (row: ExpenseRow): Expense => ({
  id: row.id,
  categoryId: row.categoryId,
  subEventId: row.subEventId,
  title: row.title,
  vendorName: row.vendorName,
  amountPaise: row.amountPaise,
  paidPaise: row.paidPaise,
  paymentStatus: row.paymentStatus as Expense['paymentStatus'],
  dueOn: row.dueOn,
  paidOn: row.paidOn,
  paidByMemberId: row.paidByMemberId,
  transactionRef: row.transactionRef,
  notes: row.notes,
  version: row.version,
  createdAt: row.createdAt.toISOString(),
});

/**
 * Runs a write in a savepoint, so a unique violation (a taken name or a recorded reference)
 * becomes an answer instead of aborting the action's whole transaction.
 */
async function unique<T, C extends string>(
  db: Queryable,
  conflict: C,
  write: (savepoint: DrizzleTx) => Promise<T>,
): Promise<T | C> {
  try {
    return await db.transaction(write);
  } catch (error) {
    if (isUniqueViolation(error)) return conflict;
    throw error;
  }
}

const liveCategory = (eventId: string, categoryId: string) =>
  and(
    eq(budgetCategories.eventId, eventId),
    eq(budgetCategories.id, categoryId),
    isNull(budgetCategories.deletedAt),
  );

export function budgetCategoryStore(db: Queryable): BudgetCategoryStore {
  return {
    async insert(eventId, list) {
      if (!list.length) return [];
      const [last] = await db
        .select({ position: sql<number>`coalesce(max(${budgetCategories.position}), -1)` })
        .from(budgetCategories)
        .where(and(eq(budgetCategories.eventId, eventId), isNull(budgetCategories.deletedAt)));
      const after = Number(last?.position ?? -1);
      const rows = await unique(db, 'name_taken', (savepoint) =>
        savepoint
          .insert(budgetCategories)
          .values(
            list.map((item, index) => ({
              eventId,
              ...item,
              position: item.position ?? after + 1 + index,
            })),
          )
          .returning(),
      );
      return rows === 'name_taken' ? rows : rows.map(toBudgetCategory);
    },
    async find(eventId, categoryId) {
      const [row] = await db
        .select()
        .from(budgetCategories)
        .where(liveCategory(eventId, categoryId));
      return row ? toBudgetCategory(row) : null;
    },
    async update(eventId, categoryId, expectedVersion, changes) {
      const rows = await unique(db, 'name_taken', (savepoint) =>
        savepoint
          .update(budgetCategories)
          .set({ ...changes, version: sql`${budgetCategories.version} + 1` })
          .where(
            and(liveCategory(eventId, categoryId), eq(budgetCategories.version, expectedVersion)),
          )
          .returning(),
      );
      if (rows === 'name_taken') return rows;
      return rows[0] ? toBudgetCategory(rows[0]) : null;
    },
    async hasExpenses(eventId, categoryId) {
      const [row] = await db
        .select({ id: expenses.id })
        .from(expenses)
        .where(
          and(
            eq(expenses.eventId, eventId),
            eq(expenses.categoryId, categoryId),
            isNull(expenses.deletedAt),
          ),
        )
        .limit(1);
      return !!row;
    },
    async softDelete(eventId, categoryId, expectedVersion) {
      const rows = await db
        .update(budgetCategories)
        .set({ deletedAt: sql`now()`, version: sql`${budgetCategories.version} + 1` })
        .where(
          and(liveCategory(eventId, categoryId), eq(budgetCategories.version, expectedVersion)),
        )
        .returning({ id: budgetCategories.id });
      return rows.length > 0;
    },
    async restore(eventId, categoryId) {
      const rows = await unique(db, 'name_taken', (savepoint) =>
        savepoint
          .update(budgetCategories)
          .set({ deletedAt: null, version: sql`${budgetCategories.version} + 1` })
          .where(
            and(
              eq(budgetCategories.eventId, eventId),
              eq(budgetCategories.id, categoryId),
              isNotNull(budgetCategories.deletedAt),
            ),
          )
          .returning(),
      );
      if (rows === 'name_taken') return rows;
      return rows[0] ? toBudgetCategory(rows[0]) : null;
    },
  };
}

const liveExpense = (eventId: string, expenseId: string) =>
  and(eq(expenses.eventId, eventId), eq(expenses.id, expenseId), isNull(expenses.deletedAt));

export function expenseStore(db: Queryable): ExpenseStore {
  return {
    async insert(eventId, expense) {
      const rows = await unique(db, 'duplicate_ref', (savepoint) =>
        savepoint
          .insert(expenses)
          .values({ eventId, ...expense })
          .returning(),
      );
      return rows === 'duplicate_ref' ? rows : toExpense(rows[0]!);
    },
    async find(eventId, expenseId) {
      const [row] = await db.select().from(expenses).where(liveExpense(eventId, expenseId));
      return row ? toExpense(row) : null;
    },
    async update(eventId, expenseId, expectedVersion, changes) {
      const rows = await unique(db, 'duplicate_ref', (savepoint) =>
        savepoint
          .update(expenses)
          .set({ ...changes, version: sql`${expenses.version} + 1` })
          .where(and(liveExpense(eventId, expenseId), eq(expenses.version, expectedVersion)))
          .returning(),
      );
      if (rows === 'duplicate_ref') return rows;
      return rows[0] ? toExpense(rows[0]) : null;
    },
    async softDelete(eventId, expenseId, expectedVersion) {
      const rows = await db
        .update(expenses)
        .set({ deletedAt: sql`now()`, version: sql`${expenses.version} + 1` })
        .where(and(liveExpense(eventId, expenseId), eq(expenses.version, expectedVersion)))
        .returning({ id: expenses.id });
      return rows.length > 0;
    },
    async restore(eventId, expenseId) {
      const rows = await unique(db, 'duplicate_ref', (savepoint) =>
        savepoint
          .update(expenses)
          .set({ deletedAt: null, version: sql`${expenses.version} + 1` })
          .where(
            and(
              eq(expenses.eventId, eventId),
              eq(expenses.id, expenseId),
              isNotNull(expenses.deletedAt),
            ),
          )
          .returning(),
      );
      if (rows === 'duplicate_ref') return rows;
      return rows[0] ? toExpense(rows[0]) : null;
    },
  };
}
