import type { BudgetCategoryTotals, CreatedMemberInvite, MyMembership, Role } from '@pme/contracts';
import { expect, test, type Page } from '@playwright/test';

import { API_URL, signUp, text, WEB_ORIGIN, weddingVia } from './helpers';

const headers = { Origin: WEB_ORIGIN };

const isoDate = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

/** The owner (this page) and an Editor in a second browser, both in one wedding. */
async function ownerAndEditor(page: Page) {
  const owner = await signUp(page, 'Priya Sharma');
  const event = await weddingVia(owner);
  const E = `/v1/events/${event.id}`;
  const roles = ((await (await owner.get(`${API_URL}${E}/roles`)).json()) as { data: Role[] }).data;
  const invite = (await (
    await owner.post(`${API_URL}${E}/member-invites`, {
      headers,
      data: { grants: [{ roleId: roles.find((role) => role.name === 'Editor')!.id }] },
    })
  ).json()) as CreatedMemberInvite;
  const context = await page.context().browser()!.newContext();
  const editor = await signUp(await context.newPage(), 'Rahul Verma');
  expect(
    (await editor.post(`${API_URL}/v1/member-invites/${invite.token}/accept`, { headers })).ok(),
  ).toBe(true);
  return { owner, editor, context, event, E };
}

test.describe('dashboard', () => {
  test('shows what needs attention, ticks off a deadline and follows changes live', async ({
    page,
  }, testInfo) => {
    const { owner, editor, context, event, E } = await ownerAndEditor(page);
    expect(
      (
        await owner.post(`${API_URL}${E}/tasks`, {
          headers,
          data: { title: 'Book the pandit', dueOn: isoDate(-2) },
        })
      ).status(),
    ).toBe(201);
    const categories = (
      (await (await owner.get(`${API_URL}${E}/budget-categories`)).json()) as {
        data: BudgetCategoryTotals[];
      }
    ).data;
    expect(
      (
        await owner.post(`${API_URL}${E}/expenses`, {
          headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
          data: {
            categoryId: categories[0]!.id,
            title: 'Lawn booking',
            amountPaise: 30_000_000,
            dueOn: isoDate(3),
          },
        })
      ).status(),
    ).toBe(201);

    await page.goto(`/events/${event.id}`);
    const attention = page.getByRole('region', { name: text('dashboard.attention.title') });
    await expect(attention).toContainText('1 task is overdue');
    await expect(attention).toContainText('1 payment due this week');
    await expect(page.getByText(text('dashboard.stats.tasks'))).toBeVisible();
    await expect(
      page.getByRole('heading', { name: text('dashboard.subEvents.title') }),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true });

    // Ticking the overdue task off: it leaves the list, and the attention item goes once
    // dashboard.changed brings the new numbers.
    await page.getByRole('checkbox', { name: /Book the pandit/ }).click();
    await expect(page.getByText('Book the pandit')).toHaveCount(0);
    await expect(attention).not.toContainText('overdue');

    // Someone else's new overdue task arrives without a reload.
    await editor.post(`${API_URL}${E}/tasks`, {
      headers,
      data: { title: 'Collect sherwani', dueOn: isoDate(-1) },
    });
    await expect(page.getByText('Collect sherwani')).toBeVisible();
    await expect(attention).toContainText('1 task is overdue');
    await context.close();
  });

  test('the bell shows a task someone assigned me, and marks it read', async ({ page }) => {
    const { owner, editor, context, event, E } = await ownerAndEditor(page);
    const me = (await (await owner.get(`${API_URL}${E}/me`)).json()) as MyMembership;
    await page.goto(`/events/${event.id}`);
    const bell = page.getByRole('button', { name: text('notifications.open'), exact: true });
    await expect(bell).toBeVisible();

    await editor.post(`${API_URL}${E}/tasks`, {
      headers,
      data: { title: 'Order flowers', assigneeIds: [me.member.id] },
    });
    const unread = page.getByRole('button', { name: 'Notifications, 1 unread' });
    await expect(unread).toBeVisible();
    await unread.click();
    const panel = page.getByRole('dialog', { name: text('notifications.title') });
    await expect(panel).toContainText('Rahul Verma assigned you “Order flowers”');
    await panel.getByRole('button', { name: text('notifications.markAll') }).click();
    await expect(panel).toContainText('No unread notifications');
    await page.keyboard.press('Escape');
    await expect(bell).toBeVisible();
    await context.close();
  });
});
