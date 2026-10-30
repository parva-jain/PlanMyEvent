import { z } from 'zod';

import { PaymentStatusSchema } from './enums.js';
import { DateOnlySchema, PaiseSchema } from './events.js';

// ---- Categories -----------------------------------------------------------------------------

export const BudgetCategorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  plannedPaise: PaiseSchema,
  position: z.number().int(),
  version: z.number().int().positive(),
});
export type BudgetCategory = z.infer<typeof BudgetCategorySchema>;

/**
 * GET E/budget-categories item (DatabaseDesign "Budget vs. actual"): committed is the sum of
 * expense amounts, paid what has gone out; both count only expenses the caller can see.
 */
export const BudgetCategoryTotalsSchema = BudgetCategorySchema.extend({
  committedPaise: PaiseSchema,
  paidPaise: PaiseSchema,
  expenseCount: z.number().int(),
});
export type BudgetCategoryTotals = z.infer<typeof BudgetCategoryTotalsSchema>;

const categoryFields = {
  name: z.string().trim().min(1, 'Enter a name').max(60),
  plannedPaise: PaiseSchema,
  position: z.number().int().min(0).max(10_000),
};

export const CreateBudgetCategorySchema = z
  .object(categoryFields)
  .partial()
  .required({ name: true });
export type CreateBudgetCategory = z.infer<typeof CreateBudgetCategorySchema>;

export const UpdateBudgetCategorySchema = z.object(categoryFields).partial();
export type UpdateBudgetCategory = z.infer<typeof UpdateBudgetCategorySchema>;

// ---- Expenses -------------------------------------------------------------------------------

export const ExpenseSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  subEventId: z.uuid().nullable(),
  title: z.string(),
  vendorName: z.string().nullable(),
  /** Total owed for this line. */
  amountPaise: PaiseSchema,
  /** Paid so far. */
  paidPaise: PaiseSchema,
  paymentStatus: PaymentStatusSchema,
  /** Next payment due. */
  dueOn: DateOnlySchema.nullable(),
  /** Last payment date. */
  paidOn: DateOnlySchema.nullable(),
  paidByMemberId: z.uuid().nullable(),
  /** UPI UTR or bank reference; unique in the event. */
  transactionRef: z.string().nullable(),
  notes: z.string().nullable(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type Expense = z.infer<typeof ExpenseSchema>;

const expenseFields = {
  categoryId: z.uuid(),
  subEventId: z.uuid().nullable(),
  title: z.string().trim().min(1, 'Enter what this is for').max(200),
  vendorName: z.string().trim().max(120).nullable(),
  amountPaise: PaiseSchema.positive('Enter an amount'),
  paidPaise: PaiseSchema,
  paymentStatus: PaymentStatusSchema,
  dueOn: DateOnlySchema.nullable(),
  paidOn: DateOnlySchema.nullable(),
  paidByMemberId: z.uuid().nullable(),
  transactionRef: z.string().trim().min(1).max(64).nullable(),
  notes: z.string().trim().max(2_000).nullable(),
};

/**
 * POST E/expenses (Idempotency-Key required). Give a status, paid so far, or both: planned
 * means nothing paid, paid means all of it, advance or partly paid something in between.
 */
export const CreateExpenseSchema = z
  .object(expenseFields)
  .partial()
  .required({ categoryId: true, title: true, amountPaise: true });
export type CreateExpense = z.infer<typeof CreateExpenseSchema>;

export const UpdateExpenseSchema = z.object(expenseFields).partial();
export type UpdateExpense = z.infer<typeof UpdateExpenseSchema>;

/**
 * Fills in whichever of status and paid-so-far is missing, then checks they agree
 * (DatabaseDesign "Status consistency check"). Returns the error message, if any.
 */
export function settlePayment(input: {
  amountPaise: number;
  paidPaise?: number | undefined;
  paymentStatus?: Expense['paymentStatus'] | undefined;
}):
  | { paidPaise: number; paymentStatus: Expense['paymentStatus'] }
  | { error: string; path: 'paidPaise' | 'paymentStatus' } {
  const { amountPaise } = input;
  const paymentStatus =
    input.paymentStatus ??
    (input.paidPaise === undefined || input.paidPaise === 0
      ? 'planned'
      : input.paidPaise >= amountPaise
        ? 'paid'
        : 'partially_paid');
  const paidPaise =
    input.paidPaise ??
    (paymentStatus === 'paid' ? amountPaise : paymentStatus === 'planned' ? 0 : undefined);
  if (paidPaise === undefined) {
    return { error: 'Enter how much has been paid', path: 'paidPaise' };
  }
  if (paidPaise > amountPaise) {
    return { error: "Can't be more than the amount", path: 'paidPaise' };
  }
  const agrees =
    paymentStatus === 'planned'
      ? paidPaise === 0
      : paymentStatus === 'paid'
        ? paidPaise === amountPaise
        : paidPaise > 0 && paidPaise < amountPaise;
  if (!agrees) {
    return {
      error:
        paymentStatus === 'planned'
          ? 'A planned expense has nothing paid yet'
          : paymentStatus === 'paid'
            ? 'Paid means the whole amount'
            : 'Some, but not all, of the amount',
      path: 'paidPaise',
    };
  }
  return { paidPaise, paymentStatus };
}

export const ExpenseQuerySchema = z.object({
  categoryId: z.uuid().optional(),
  subEventId: z.uuid().optional(),
  paymentStatus: PaymentStatusSchema.optional(),
  dueBefore: DateOnlySchema.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});
export type ExpenseQuery = z.infer<typeof ExpenseQuerySchema>;
