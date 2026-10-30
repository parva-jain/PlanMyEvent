import type { BudgetCategoryTotals, Expense, ExpenseQuery } from '@pme/contracts';
import { and, asc, eq, gt, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm';

import type { Database } from '../client.js';
import { budgetCategories, expenses } from '../schema/budget.js';
import { expenseStore, toBudgetCategory, toExpense } from '../stores/budget.js';
import type { TaskVisibility } from './tasks.js';
import { decodeCursor, encodeCursor } from './cursor.js';

/** Which sub-events' expenses the caller may read (budget.view): all, or these only. */
export type BudgetVisibility = TaskVisibility;

const visibleTo = (visible: BudgetVisibility): SQL | undefined =>
  visible === 'all'
    ? undefined
    : visible.size
      ? inArray(expenses.subEventId, [...visible])
      : sql`false`;

/** Budget reads for the API; callers check budget.view first and pass what it covers. */
export function budgetQueries(db: Database) {
  const store = expenseStore(db);
  return {
    getExpense: (eventId: string, expenseId: string): Promise<Expense | null> =>
      store.find(eventId, expenseId),

    /**
     * GET E/budget-categories (DatabaseDesign "Budget vs. actual"): every category, in order,
     * with totals over the expenses the caller can see.
     */
    async listCategories(
      eventId: string,
      visible: BudgetVisibility,
    ): Promise<BudgetCategoryTotals[]> {
      const rows = await db
        .select({
          category: budgetCategories,
          committedPaise: sql<string>`coalesce(sum(${expenses.amountPaise}), 0)`,
          paidPaise: sql<string>`coalesce(sum(${expenses.paidPaise}), 0)`,
          expenseCount: sql<number>`count(${expenses.id})::int`,
        })
        .from(budgetCategories)
        .leftJoin(
          expenses,
          and(
            eq(expenses.categoryId, budgetCategories.id),
            isNull(expenses.deletedAt),
            visibleTo(visible),
          ),
        )
        .where(and(eq(budgetCategories.eventId, eventId), isNull(budgetCategories.deletedAt)))
        .groupBy(budgetCategories.id)
        .orderBy(asc(budgetCategories.position), asc(budgetCategories.id));
      // sum(bigint) is numeric, which the driver returns as a string.
      return rows.map((row) => ({
        ...toBudgetCategory(row.category),
        committedPaise: Number(row.committedPaise),
        paidPaise: Number(row.paidPaise),
        expenseCount: row.expenseCount,
      }));
    },

    /** GET E/expenses: oldest first by id, cursor-paginated, filtered to the caller's scope. */
    async listExpenses(eventId: string, query: ExpenseQuery, visible: BudgetVisibility) {
      const filters: (SQL | undefined)[] = [
        eq(expenses.eventId, eventId),
        isNull(expenses.deletedAt),
        visibleTo(visible),
      ];
      if (query.categoryId) filters.push(eq(expenses.categoryId, query.categoryId));
      if (query.subEventId) filters.push(eq(expenses.subEventId, query.subEventId));
      if (query.paymentStatus) filters.push(eq(expenses.paymentStatus, query.paymentStatus));
      if (query.dueBefore) filters.push(lte(expenses.dueOn, query.dueBefore));
      if (query.cursor) filters.push(gt(expenses.id, decodeCursor(query.cursor)));
      const rows = await db
        .select()
        .from(expenses)
        .where(and(...filters))
        .orderBy(asc(expenses.id))
        .limit(query.limit + 1);
      const page = rows.slice(0, query.limit);
      const hasMore = rows.length > query.limit;
      return {
        data: page.map(toExpense),
        nextCursor: hasMore ? encodeCursor(page.at(-1)!.id) : null,
        hasMore,
      };
    },
  };
}

export type BudgetQueries = ReturnType<typeof budgetQueries>;
