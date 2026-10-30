import type { BudgetCategoryTotals, Expense } from '@pme/contracts';
import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

import { API_URL, signUp, text, WEB_ORIGIN, weddingVia } from './helpers';

const headers = { Origin: WEB_ORIGIN };

async function list<T>(api: APIRequestContext, path: string): Promise<T[]> {
  return ((await (await api.get(`${API_URL}${path}`)).json()) as { data: T[] }).data;
}

test.describe('budget', () => {
  test('set the budget, add an expense with an advance, and see the totals and the bar', async ({
    page,
  }) => {
    const owner = await signUp(page);
    const event = await weddingVia(owner);
    const E = `/v1/events/${event.id}`;
    await page.goto(`/events/${event.id}/budget`);

    await expect(page.getByTestId('budget-category')).toHaveCount(12);
    await page.getByLabel(text('budget.setBudget')).fill('2500000');
    // Indian grouping as you type.
    await expect(page.getByLabel(text('budget.setBudget'))).toHaveValue('25,00,000');
    await page.getByRole('button', { name: text('budget.saveBudget') }).click();
    await expect(page.getByTestId('budget-summary')).toContainText('₹25,00,000');

    await page.getByRole('button', { name: text('budget.addExpense') }).click();
    const form = page.getByTestId('expense-form');
    await form.getByLabel(text('budget.form.title')).fill('Caterer');
    await form.getByLabel(text('budget.form.amount')).fill('180000');
    await form.getByLabel(text('budget.form.category')).selectOption({ label: 'Catering' });
    // Advance paid reveals paid-so-far and the payment details.
    await expect(form.getByLabel(text('budget.form.paidSoFar'))).toHaveCount(0);
    await form.getByRole('radio', { name: text('budget.status.advance_paid') }).click();
    await form.getByLabel(text('budget.form.paidSoFar')).fill('180000');
    await form.getByRole('button', { name: text('budget.form.create') }).click();
    // All of it isn't an advance.
    await expect(form.getByText(text('budget.form.paidBetween'))).toBeVisible();
    await form.getByLabel(text('budget.form.paidSoFar')).fill('20000');
    await form.getByLabel(text('budget.form.reference')).fill('UTR-555');
    await form.getByRole('button', { name: text('budget.form.create') }).click();
    await expect(form).toHaveCount(0);

    await expect(page.getByTestId('total-committed')).toContainText('₹1,80,000');
    await expect(page.getByTestId('total-paid')).toContainText('₹20,000');
    await expect(page.getByTestId('total-outstanding')).toContainText('₹1,60,000');
    const catering = page.getByTestId('budget-category').filter({ hasText: 'Catering' });
    await expect(catering).toContainText('₹1,80,000 · no plan yet');
    await catering
      .getByRole('button', { name: /Catering/ })
      .first()
      .click();
    await expect(catering.getByTestId('expense-row')).toContainText('Caterer');
    await expect(catering.getByTestId('payment-status')).toContainText(
      text('budget.status.advance_paid'),
    );

    // A second expense with the same UTR is refused on the reference field.
    await page.getByRole('button', { name: text('budget.addExpense') }).click();
    await form.getByLabel(text('budget.form.title')).fill('Caterer again');
    await form.getByLabel(text('budget.form.amount')).fill('5000');
    await form.getByRole('radio', { name: text('budget.status.paid'), exact: true }).click();
    await form.getByLabel(text('budget.form.reference')).fill('UTR-555');
    await form.getByRole('button', { name: text('budget.form.create') }).click();
    await expect(form.getByText(text('budget.form.duplicateRef'))).toBeVisible();

    const expenses = await list<Expense>(owner, `${E}/expenses`);
    expect(expenses).toMatchObject([
      { title: 'Caterer', amountPaise: 18_000_000, paidPaise: 2_000_000 },
    ]);
  });

  test('quick add logs a paid expense in one line and it shows under All expenses', async ({
    page,
  }) => {
    const owner = await signUp(page);
    const event = await weddingVia(owner);
    await page.goto(`/events/${event.id}/budget`);

    const quick = page.getByTestId('quick-expense');
    await quick.getByLabel(text('budget.quick.title')).fill('Mehendi cones');
    await quick.getByLabel(text('budget.quick.amount')).fill('3500');
    await quick.getByRole('button', { name: text('budget.quick.add') }).click();
    await expect(quick.getByText(text('budget.quick.categoryRequired'))).toBeVisible();
    await quick.getByLabel(text('budget.quick.category')).selectOption({ label: 'Decor' });
    await quick.getByLabel(text('budget.quick.alreadyPaid')).check();
    await quick.getByRole('button', { name: text('budget.quick.add') }).click();

    await expect(page.getByTestId('snackbar')).toContainText('Mehendi cones added to Decor');
    await expect(quick.getByLabel(text('budget.quick.title'))).toHaveValue('');
    await expect(page.getByTestId('total-paid')).toContainText('₹3,500');
    await page.getByRole('tab', { name: text('budget.allExpenses') }).click();
    const row = page.getByTestId('all-expenses').getByTestId('expense-row');
    await expect(row).toContainText('Mehendi cones');
    await expect(row).toContainText('Decor');
    await expect(row.getByTestId('payment-status')).toContainText(text('budget.status.paid'));
  });

  test('over its plan, a category says by how much; deleting an expense can be undone', async ({
    page,
  }) => {
    const owner = await signUp(page);
    const event = await weddingVia(owner);
    const E = `/v1/events/${event.id}`;
    const decor = (await list<BudgetCategoryTotals>(owner, `${E}/budget-categories`)).find(
      (item) => item.name === 'Decor',
    )!;
    expect(
      (
        await owner.patch(`${API_URL}${E}/budget-categories/${decor.id}`, {
          headers: { ...headers, 'If-Match': `"${decor.version}"` },
          data: { plannedPaise: 1_000_000 },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await owner.post(`${API_URL}${E}/expenses`, {
          headers: { ...headers, 'Idempotency-Key': randomUUID() },
          data: { categoryId: decor.id, title: 'Flowers', amountPaise: 1_200_000 },
        })
      ).status(),
    ).toBe(201);

    await page.goto(`/events/${event.id}/budget`);
    const row = page.getByTestId('budget-category').filter({ hasText: 'Decor' });
    await expect(row).toContainText('Over by ₹2,000');

    await row.getByRole('button', { name: /Decor/ }).first().click();
    await row.getByTestId('expense-row').click();
    const form = page.getByTestId('expense-form');
    await form.getByRole('button', { name: text('budget.form.delete') }).click();
    await form.getByRole('button', { name: text('budget.form.confirmDelete') }).click();
    await expect(row).not.toContainText('Over by');
    const snackbar = page.getByTestId('snackbar');
    await expect(snackbar).toContainText('Flowers deleted');
    await snackbar.hover();
    await snackbar.getByRole('button', { name: text('app.snackbar.undo') }).click();
    await expect(row).toContainText('Over by ₹2,000');
  });
});
