import { describe, expect, it } from 'vitest';

import { undoActivity } from '../activity/undo.js';
import { testWedding } from '../testing/wedding.js';
import {
  createBudgetCategory,
  createExpense,
  deleteBudgetCategory,
  deleteExpense,
  updateBudgetCategory,
  updateExpense,
} from './budget-actions.js';

async function wedding() {
  const wedding = await testWedding();
  await wedding.addMember('editor', [{ roleId: wedding.role('Editor').id, subEventIds: [] }]);
  await wedding.addMember('mehendi-editor', [
    { roleId: wedding.role('Editor').id, subEventIds: [wedding.subEvent('Mehendi').id] },
  ]);
  await wedding.addMember('helper', [{ roleId: wedding.role('Helper').id, subEventIds: [] }]);
  const category = (name: string) =>
    [...wedding.categories.values()].find((item) => item.name === name && !item.deleted)!;
  const undo = (userId: string) =>
    wedding.run(userId, undoActivity, { entryId: wedding.activity.at(-1)!.id });
  return { ...wedding, category, undo };
}

describe('budget categories', () => {
  it('come with the template, in order', async () => {
    const { categories } = await testWedding();
    expect([...categories.values()].map((item) => item.name).slice(0, 3)).toEqual([
      'Venue',
      'Catering',
      'Decor',
    ]);
  });

  it('need budget.edit for the whole event; names are unique ignoring case', async () => {
    const { run } = await wedding();
    await expect(run('helper', createBudgetCategory, { name: 'Flowers' })).rejects.toMatchObject({
      code: 'forbidden',
    });
    await expect(
      run('mehendi-editor', createBudgetCategory, { name: 'Flowers' }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(run('editor', createBudgetCategory, { name: 'catering' })).rejects.toMatchObject({
      code: 'validation_failed',
    });
    const flowers = await run('editor', createBudgetCategory, {
      name: 'Flowers',
      plannedPaise: 5_000_000,
    });
    expect(flowers).toMatchObject({ plannedPaise: 5_000_000, version: 1 });
  });

  it("can't be deleted while expenses use them; undo restores a deleted one", async () => {
    const { run, category, undo } = await wedding();
    const catering = category('Catering');
    const expense = await run('editor', createExpense, {
      categoryId: catering.id,
      title: 'Caterer advance',
      amountPaise: 18_000_000,
    });
    await expect(
      run('editor', deleteBudgetCategory, { categoryId: catering.id, expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: 'conflict', details: { reason: 'category_in_use' } });
    await run('editor', deleteExpense, { expenseId: expense.id, expectedVersion: 1 });
    await run('editor', deleteBudgetCategory, { categoryId: catering.id, expectedVersion: 1 });
    await undo('editor');
    expect(category('Catering')).toBeDefined();
  });

  it('undo puts back an edit', async () => {
    const { run, category, undo } = await wedding();
    const venue = category('Venue');
    await run('editor', updateBudgetCategory, {
      categoryId: venue.id,
      expectedVersion: 1,
      changes: { plannedPaise: 50_000_000 },
    });
    await undo('editor');
    expect(category('Venue')).toMatchObject({ plannedPaise: 0, version: 3 });
  });
});

describe('expenses', () => {
  it('keep amounts consistent with the payment status', async () => {
    const { run, category } = await wedding();
    const categoryId = category('Catering').id;
    const advance = await run('editor', createExpense, {
      categoryId,
      title: 'Caterer advance',
      amountPaise: 18_000_000,
      paidPaise: 2_000_000,
      paymentStatus: 'advance_paid',
    });
    expect(advance).toMatchObject({ paymentStatus: 'advance_paid', paidPaise: 2_000_000 });
    await expect(
      run('editor', createExpense, {
        categoryId,
        title: 'x',
        amountPaise: 100,
        paidPaise: 100,
        paymentStatus: 'advance_paid',
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });

    // Marking it paid pays the whole amount; raising the amount of a paid line keeps it paid.
    const paid = await run('editor', updateExpense, {
      expenseId: advance.id,
      expectedVersion: 1,
      changes: { paymentStatus: 'paid' },
    });
    expect(paid.paidPaise).toBe(18_000_000);
    const raised = await run('editor', updateExpense, {
      expenseId: advance.id,
      expectedVersion: 2,
      changes: { amountPaise: 20_000_000 },
    });
    expect(raised).toMatchObject({ paymentStatus: 'paid', paidPaise: 20_000_000 });
    // Paying part keeps "advance" only if it was one; here it becomes partly paid.
    const part = await run('editor', updateExpense, {
      expenseId: advance.id,
      expectedVersion: 3,
      changes: { paidPaise: 5_000_000 },
    });
    expect(part.paymentStatus).toBe('partially_paid');
  });

  it('refuse a transaction reference already recorded in the event', async () => {
    const { run, category } = await wedding();
    const base = { categoryId: category('Venue').id, amountPaise: 100, paidPaise: 100 };
    await run('editor', createExpense, { ...base, title: 'A', transactionRef: '429817365012' });
    await expect(
      run('editor', createExpense, { ...base, title: 'B', transactionRef: '429817365012' }),
    ).rejects.toMatchObject({ code: 'duplicate_transaction_ref' });
  });

  it('follow sub-event scope, and validate category and payer', async () => {
    const { run, category, subEvent } = await wedding();
    const categoryId = category('Mehendi').id;
    await expect(
      run('mehendi-editor', createExpense, { categoryId, title: 'Henna', amountPaise: 100 }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    const henna = await run('mehendi-editor', createExpense, {
      categoryId,
      subEventId: subEvent('Mehendi').id,
      title: 'Henna',
      amountPaise: 100,
    });
    expect(henna.subEventId).toBe(subEvent('Mehendi').id);
    await expect(
      run('editor', createExpense, {
        categoryId: '00000000-0000-7000-8000-999999999999',
        title: 'x',
        amountPaise: 100,
      }),
    ).rejects.toMatchObject({ code: 'validation_failed' });
  });

  it('undo reverses a create, an edit and a delete', async () => {
    const { run, category, undo, expenses } = await wedding();
    const expense = await run('editor', createExpense, {
      categoryId: category('Decor').id,
      title: 'Flowers',
      amountPaise: 500_000,
    });
    await run('editor', updateExpense, {
      expenseId: expense.id,
      expectedVersion: 1,
      changes: { amountPaise: 700_000, vendorName: 'Phool Wala' },
    });
    await undo('editor');
    expect(expenses.get(expense.id)).toMatchObject({ amountPaise: 500_000, vendorName: null });
    await run('editor', deleteExpense, { expenseId: expense.id, expectedVersion: 3 });
    await undo('editor');
    expect(expenses.get(expense.id)?.deleted).toBe(false);
  });
});
