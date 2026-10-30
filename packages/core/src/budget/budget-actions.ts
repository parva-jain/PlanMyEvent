import {
  settlePayment,
  type BudgetCategory,
  type CreateBudgetCategory,
  type CreateExpense,
  type Expense,
  type UpdateBudgetCategory,
  type UpdateExpense,
} from '@pme/contracts';

import type { ActionDefinition } from '../action.js';
import type { ActionContext } from '../context.js';
import { ActionError } from '../errors.js';
import { versionMismatch } from '../events/versioned.js';
import type { CoreTx, NewExpense } from '../ports.js';
import { requirePermission } from '../team/access.js';

const fieldError = (path: string, message: string) =>
  new ActionError('validation_failed', message, { fields: [{ path, message }] });

const nameTaken = () => fieldError('name', 'There is already a category with this name');

/** 409 duplicate_transaction_ref: the same UPI or bank reference twice (APIDesign example). */
const duplicateRef = () =>
  new ActionError('duplicate_transaction_ref', 'This transaction reference is already recorded', {
    fields: [{ path: 'transactionRef', message: 'Already recorded on another expense' }],
  });

// ---- Categories (event-wide: budget.edit on the whole event) ----------------------------------

export const createBudgetCategory: ActionDefinition<CreateBudgetCategory, BudgetCategory, CoreTx> =
  {
    name: 'budgetCategories.create',
    permission: 'budget.edit',
    async execute(tx, ctx, input) {
      const created = await tx.budgetCategories.insert(ctx.eventId!, [input]);
      if (created === 'name_taken') throw nameTaken();
      const category = created[0]!;
      return {
        result: category,
        activity: [
          {
            action: 'create',
            entityType: 'budget_category',
            entityId: category.id,
            before: null,
            after: category,
          },
        ],
      };
    },
  };

export const updateBudgetCategory: ActionDefinition<
  { categoryId: string; expectedVersion: number; changes: UpdateBudgetCategory },
  BudgetCategory,
  CoreTx
> = {
  name: 'budgetCategories.update',
  permission: 'budget.edit',
  async execute(tx, ctx, { categoryId, expectedVersion, changes }) {
    const eventId = ctx.eventId!;
    const before = await tx.budgetCategories.find(eventId, categoryId);
    if (!before) throw new ActionError('not_found', 'Category not found');
    const after = await tx.budgetCategories.update(eventId, categoryId, expectedVersion, changes);
    if (after === 'name_taken') throw nameTaken();
    if (!after)
      versionMismatch(await tx.budgetCategories.find(eventId, categoryId), expectedVersion);
    return {
      result: after,
      activity: [
        { action: 'update', entityType: 'budget_category', entityId: categoryId, before, after },
      ],
    };
  },
};

/** Refused while live expenses use it (APIDesign): move or delete those first. */
export const deleteBudgetCategory: ActionDefinition<
  { categoryId: string; expectedVersion: number },
  void,
  CoreTx
> = {
  name: 'budgetCategories.delete',
  permission: 'budget.edit',
  async execute(tx, ctx, { categoryId, expectedVersion }) {
    const eventId = ctx.eventId!;
    const before = await tx.budgetCategories.find(eventId, categoryId);
    if (!before) throw new ActionError('not_found', 'Category not found');
    if (await tx.budgetCategories.hasExpenses(eventId, categoryId)) {
      throw new ActionError('conflict', 'Move or delete its expenses first', {
        reason: 'category_in_use',
      });
    }
    if (!(await tx.budgetCategories.softDelete(eventId, categoryId, expectedVersion))) {
      versionMismatch(await tx.budgetCategories.find(eventId, categoryId), expectedVersion);
    }
    return {
      result: undefined,
      activity: [
        {
          action: 'delete',
          entityType: 'budget_category',
          entityId: categoryId,
          before,
          after: null,
        },
      ],
    };
  },
};

export const restoreBudgetCategory: ActionDefinition<
  { categoryId: string },
  BudgetCategory,
  CoreTx
> = {
  name: 'budgetCategories.restore',
  permission: 'budget.edit',
  async execute(tx, ctx, { categoryId }) {
    const after = await tx.budgetCategories.restore(ctx.eventId!, categoryId);
    if (after === 'name_taken') {
      throw new ActionError('conflict', 'Another category has this name now', {
        reason: 'name_taken',
      });
    }
    if (!after) throw new ActionError('not_found', 'Category not found');
    return {
      result: after,
      activity: [
        {
          action: 'restore',
          entityType: 'budget_category',
          entityId: categoryId,
          before: null,
          after,
        },
      ],
    };
  },
};

// ---- Expenses (budget.edit in the expense's sub-event) ----------------------------------------

/** Category, sub-event and payer must belong to this event; the payer must be an active member. */
async function assertReferences(
  tx: CoreTx,
  eventId: string,
  refs: { categoryId?: string; subEventId?: string | null; paidByMemberId?: string | null },
) {
  if (refs.categoryId && !(await tx.budgetCategories.find(eventId, refs.categoryId))) {
    throw fieldError('categoryId', 'Category not found in this event');
  }
  if (refs.subEventId && !(await tx.subEvents.find(eventId, refs.subEventId))) {
    throw fieldError('subEventId', 'Sub-event not found in this event');
  }
  if (refs.paidByMemberId) {
    const member = await tx.members.find(eventId, refs.paidByMemberId);
    if (member?.status !== 'active')
      throw fieldError('paidByMemberId', 'Not a member of this event');
  }
}

function settled(input: Parameters<typeof settlePayment>[0]) {
  const result = settlePayment(input);
  if ('error' in result) throw fieldError(result.path, result.error);
  return result;
}

const findExpense = async (tx: CoreTx, ctx: ActionContext, expenseId: string) => {
  const expense = await tx.expenses.find(ctx.eventId!, expenseId);
  if (!expense) throw new ActionError('not_found', 'Expense not found');
  return expense;
};

/** POST E/expenses: the server re-checks amounts against the status and the reference. */
export const createExpense: ActionDefinition<CreateExpense, Expense, CoreTx> = {
  name: 'expenses.create',
  permission: 'budget.edit',
  subEventOf: (_tx, _ctx, input) => input.subEventId ?? null,
  async execute(tx, ctx, input) {
    const eventId = ctx.eventId!;
    await assertReferences(tx, eventId, input);
    const payment = settled(input);
    const expense = await tx.expenses.insert(eventId, {
      categoryId: input.categoryId,
      subEventId: input.subEventId ?? null,
      title: input.title,
      vendorName: input.vendorName ?? null,
      amountPaise: input.amountPaise,
      ...payment,
      dueOn: input.dueOn ?? null,
      paidOn: input.paidOn ?? null,
      paidByMemberId: input.paidByMemberId ?? null,
      transactionRef: input.transactionRef ?? null,
      notes: input.notes ?? null,
    });
    if (expense === 'duplicate_ref') throw duplicateRef();
    return {
      result: expense,
      activity: [
        {
          action: 'create',
          entityType: 'expense',
          entityId: expense.id,
          before: null,
          after: expense,
        },
      ],
    };
  },
};

/**
 * The status and paid-so-far after an edit: what was sent, else kept, with "paid" following
 * a changed amount and a partly-paid kind (advance or partly) kept while it still fits.
 */
function paymentAfter(before: Expense, changes: UpdateExpense) {
  const amountPaise = changes.amountPaise ?? before.amountPaise;
  let { paymentStatus, paidPaise } = changes;
  const partial = (status: Expense['paymentStatus']) =>
    status === 'advance_paid' || status === 'partially_paid';
  if (paymentStatus === undefined) {
    if (paidPaise === undefined) {
      paymentStatus = before.paymentStatus;
      paidPaise = before.paymentStatus === 'paid' ? amountPaise : before.paidPaise;
    } else if (paidPaise > 0 && paidPaise < amountPaise && partial(before.paymentStatus)) {
      paymentStatus = before.paymentStatus;
    }
  } else if (paidPaise === undefined && partial(paymentStatus)) {
    paidPaise = before.paidPaise;
  }
  return settled({ amountPaise, paidPaise, paymentStatus });
}

export const updateExpense: ActionDefinition<
  { expenseId: string; expectedVersion: number; changes: UpdateExpense },
  Expense,
  CoreTx
> = {
  name: 'expenses.update',
  permission: 'budget.edit',
  async subEventOf(tx, ctx, input) {
    return (await tx.expenses.find(ctx.eventId!, input.expenseId))?.subEventId ?? null;
  },
  async execute(tx, ctx, { expenseId, expectedVersion, changes }) {
    const eventId = ctx.eventId!;
    const before = await findExpense(tx, ctx, expenseId);
    if (changes.subEventId !== undefined && changes.subEventId !== before.subEventId) {
      await requirePermission(tx, ctx, 'budget.edit', changes.subEventId);
    }
    await assertReferences(tx, eventId, changes);
    const fields: Partial<NewExpense> = { ...changes, ...paymentAfter(before, changes) };
    const after = await tx.expenses.update(eventId, expenseId, expectedVersion, fields);
    if (after === 'duplicate_ref') throw duplicateRef();
    if (!after) versionMismatch(await tx.expenses.find(eventId, expenseId), expectedVersion);
    return {
      result: after,
      activity: [{ action: 'update', entityType: 'expense', entityId: expenseId, before, after }],
    };
  },
};

export const deleteExpense: ActionDefinition<
  { expenseId: string; expectedVersion: number },
  void,
  CoreTx
> = {
  name: 'expenses.delete',
  permission: 'budget.edit',
  async subEventOf(tx, ctx, input) {
    return (await tx.expenses.find(ctx.eventId!, input.expenseId))?.subEventId ?? null;
  },
  async execute(tx, ctx, { expenseId, expectedVersion }) {
    const eventId = ctx.eventId!;
    const before = await findExpense(tx, ctx, expenseId);
    if (!(await tx.expenses.softDelete(eventId, expenseId, expectedVersion))) {
      versionMismatch(await tx.expenses.find(eventId, expenseId), expectedVersion);
    }
    return {
      result: undefined,
      activity: [
        { action: 'delete', entityType: 'expense', entityId: expenseId, before, after: null },
      ],
    };
  },
};

/**
 * Brings back a soft-deleted expense (undo of a delete). Refused if its category is gone or
 * its reference was recorded again meanwhile.
 */
export const restoreExpense: ActionDefinition<
  { expenseId: string; subEventId: string | null },
  Expense,
  CoreTx
> = {
  name: 'expenses.restore',
  permission: 'budget.edit',
  subEventOf: (_tx, _ctx, input) => input.subEventId,
  async execute(tx, ctx, { expenseId }) {
    const eventId = ctx.eventId!;
    const after = await tx.expenses.restore(eventId, expenseId);
    if (after === 'duplicate_ref') throw duplicateRef();
    if (!after) throw new ActionError('not_found', 'Expense not found');
    if (!(await tx.budgetCategories.find(eventId, after.categoryId))) {
      throw new ActionError('conflict', 'Its category was deleted', { reason: 'category_deleted' });
    }
    return {
      result: after,
      activity: [
        { action: 'restore', entityType: 'expense', entityId: expenseId, before: null, after },
      ],
    };
  },
};
