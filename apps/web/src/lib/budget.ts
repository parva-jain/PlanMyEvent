'use client';

import type {
  BudgetCategory,
  BudgetCategoryTotals,
  CreateBudgetCategory,
  CreateExpense,
  Expense,
  UpdateBudgetCategory,
  UpdateExpense,
} from '@pme/contracts';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { apiFetch, ApiError, newRequestId } from './api';

interface Page<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const budgetKeys = {
  categories: (eventId: string) => ['events', eventId, 'budget-categories'] as const,
  expenses: (eventId: string) => ['events', eventId, 'expenses'] as const,
};

const E = (eventId: string) => `/v1/events/${eventId}` as const;
const ifMatch = (version: number) => ({ 'If-Match': `"${version}"` });

// ---- Reads -------------------------------------------------------------------------------

/** GET E/budget-categories: every category with planned, committed and paid totals. */
export function useBudgetCategories(eventId: string) {
  return useQuery({
    queryKey: budgetKeys.categories(eventId),
    queryFn: async () =>
      (await apiFetch<Page<BudgetCategoryTotals>>(`${E(eventId)}/budget-categories`)).data,
  });
}

/** Every expense I can see, in one array (pages of 500); screens group them locally. */
export function useExpenses(eventId: string) {
  return useQuery({
    queryKey: budgetKeys.expenses(eventId),
    queryFn: async () => {
      const expenses: Expense[] = [];
      let cursor: string | null = null;
      do {
        const query: string = cursor ? `&cursor=${cursor}` : '';
        const page: Page<Expense> = await apiFetch(`${E(eventId)}/expenses?limit=500${query}`);
        expenses.push(...page.data);
        cursor = page.hasMore ? page.nextCursor : null;
      } while (cursor);
      return expenses;
    },
  });
}

// ---- Writes ------------------------------------------------------------------------------

/** Totals are the server's sums: any expense or category write refreshes both lists. */
function refresh(queryClient: QueryClient, eventId: string) {
  void queryClient.invalidateQueries({ queryKey: budgetKeys.categories(eventId) });
  void queryClient.invalidateQueries({ queryKey: budgetKeys.expenses(eventId) });
}

export function useSaveCategory(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      input:
        | { category: BudgetCategory; changes: UpdateBudgetCategory }
        | { create: CreateBudgetCategory },
    ) =>
      'create' in input
        ? apiFetch<BudgetCategory>(`${E(eventId)}/budget-categories`, {
            method: 'POST',
            body: input.create,
          })
        : apiFetch<BudgetCategory>(`${E(eventId)}/budget-categories/${input.category.id}`, {
            method: 'PATCH',
            body: input.changes,
            headers: ifMatch(input.category.version),
          }),
    onSettled: () => refresh(queryClient, eventId),
  });
}

export function useDeleteCategory(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    /** Resolves with the request id, to undo it from the undo bar. */
    mutationFn: async (category: BudgetCategory) => {
      const requestId = newRequestId();
      await apiFetch<null>(`${E(eventId)}/budget-categories/${category.id}`, {
        method: 'DELETE',
        headers: ifMatch(category.version),
        requestId,
      });
      return requestId;
    },
    onSettled: () => refresh(queryClient, eventId),
  });
}

/**
 * Create or edit an expense. A create carries the Idempotency-Key the form made when it
 * opened (POST E/expenses requires one), so a retried save never records it twice.
 */
export function useSaveExpense(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      input:
        | { expense: Expense; changes: UpdateExpense }
        | { create: CreateExpense; idempotencyKey: string },
    ) =>
      'create' in input
        ? apiFetch<Expense>(`${E(eventId)}/expenses`, {
            method: 'POST',
            body: input.create,
            headers: { 'Idempotency-Key': input.idempotencyKey },
          })
        : apiFetch<Expense>(`${E(eventId)}/expenses/${input.expense.id}`, {
            method: 'PATCH',
            body: input.changes,
            headers: ifMatch(input.expense.version),
          }),
    // 409 request_in_progress: the first try with this key is still running (see useCreateEvent).
    retry: (count, error) =>
      error instanceof ApiError && error.problem?.code === 'request_in_progress' && count < 5,
    retryDelay: 1000,
    onSettled: () => refresh(queryClient, eventId),
  });
}

export function useDeleteExpense(eventId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    /** Resolves with the request id, to undo it from the undo bar. */
    mutationFn: async (expense: Expense) => {
      const requestId = newRequestId();
      await apiFetch<null>(`${E(eventId)}/expenses/${expense.id}`, {
        method: 'DELETE',
        headers: ifMatch(expense.version),
        requestId,
      });
      return requestId;
    },
    onSuccess: (_requestId, expense) =>
      queryClient.setQueryData<Expense[]>(budgetKeys.expenses(eventId), (expenses = []) =>
        expenses.filter((item) => item.id !== expense.id),
      ),
    onSettled: () => refresh(queryClient, eventId),
  });
}
