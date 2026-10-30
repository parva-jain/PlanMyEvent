import type { SubEvent, Task } from '@pme/contracts';
import { expect, test, type APIRequestContext } from '@playwright/test';

import { API_URL, isPhone, signUp, text, WEB_ORIGIN, weddingVia } from './helpers';

const headers = { Origin: WEB_ORIGIN };

async function list<T>(api: APIRequestContext, path: string): Promise<T[]> {
  return ((await (await api.get(`${API_URL}${path}`)).json()) as { data: T[] }).data;
}

const taskNamed = async (api: APIRequestContext, E: string, title: string) =>
  (await list<Task>(api, `${E}/tasks`)).find((task) => task.title === title)!;

test.describe('tasks', () => {
  test('starter tasks, quick add, ticking off, the panel with subtasks, and delete with undo', async ({
    page,
  }) => {
    const owner = await signUp(page);
    const event = await weddingVia(owner);
    const E = `/v1/events/${event.id}`;
    await page.goto(`/events/${event.id}/tasks`);

    const rows = page.getByTestId('task-row');
    await expect(rows).toHaveCount(12);
    await expect(page.getByTestId('tasks-summary')).toContainText('0 of 12 done');
    // The Mehendi task carries its sub-event.
    await expect(rows.filter({ hasText: 'Book the mehendi artist' })).toContainText('Mehendi');

    // Quick add lands in To do.
    await page.getByLabel(text('tasks.quickAdd')).fill('Order the sweets');
    await page.getByLabel(text('tasks.quickAdd')).press('Enter');
    const todo = page.getByTestId('task-group-todo');
    await expect(todo.getByTestId('task-row').filter({ hasText: 'Order the sweets' })).toHaveCount(
      1,
    );

    // Ticking strikes it through, then it moves to Done.
    await page.getByRole('checkbox', { name: 'Done: Order the sweets' }).click();
    const done = page.getByTestId('task-group-done');
    await expect(done.getByTestId('task-row').filter({ hasText: 'Order the sweets' })).toHaveCount(
      1,
    );
    await expect(page.getByTestId('tasks-summary')).toContainText('1 of 13 done');
    await expect
      .poll(async () => (await taskNamed(owner, E, 'Order the sweets')).status)
      .toBe('done');

    // The panel edits the task and keeps a checklist.
    await rows.filter({ hasText: 'Book the caterer' }).getByRole('button').click();
    const form = page.getByTestId('task-form');
    await form.getByLabel(text('tasks.form.title')).fill('Book the caterer for 300');
    await form.getByLabel(text('tasks.form.priority')).selectOption('urgent');
    await form.getByPlaceholder(text('tasks.newSubtask')).fill('Taste the menu');
    await form.getByPlaceholder(text('tasks.newSubtask')).press('Enter');
    await expect(form.getByTestId('subtasks')).toContainText('Taste the menu');
    await form.getByRole('button', { name: text('tasks.form.save') }).click();
    await expect(form).toHaveCount(0);
    const caterer = rows.filter({ hasText: 'Book the caterer for 300' });
    await expect(caterer).toContainText(text('tasks.priority.urgent'));
    await expect(caterer).toContainText('0/1');

    // Delete, then undo from the bar.
    await caterer.getByRole('button').click();
    await form.getByRole('button', { name: text('tasks.form.delete') }).click();
    await form.getByRole('button', { name: text('tasks.form.confirmDelete') }).click();
    const snackbar = page.getByTestId('snackbar');
    await expect(snackbar).toContainText('Book the caterer for 300 deleted');
    await expect(caterer).toHaveCount(0);
    await snackbar.hover();
    await snackbar.getByRole('button', { name: text('app.snackbar.undo') }).click();
    await expect(caterer).toHaveCount(1);
    // Its subtask came back with it.
    await expect
      .poll(async () => (await taskNamed(owner, E, 'Book the caterer for 300'))?.subtasks.total)
      .toBe(1);
  });

  test('a card moves between columns on the board with the keyboard', async ({ page }) => {
    test.skip(isPhone(), 'Board columns scroll sideways on a phone; the keyboard path is the same');
    const owner = await signUp(page);
    const event = await weddingVia(owner);
    const E = `/v1/events/${event.id}`;
    await page.goto(`/events/${event.id}/tasks`);
    await page.getByRole('tab', { name: text('tasks.board') }).click();

    const card = page.getByTestId('task-card').filter({ hasText: 'Book the venue' });
    // dnd-kit's live region says what happened; waiting on it keeps the keys in step.
    const announced = page.locator('[id^="DndLiveRegion"]');
    await card.focus();
    await page.keyboard.press('Space');
    // Picking up announces where it is (dnd-kit's first "over" is the card itself).
    await expect(announced).toContainText('Book the venue is in To do, position 1');
    await page.keyboard.press('ArrowRight');
    await expect(announced).toContainText('Book the venue is in In progress');
    await page.keyboard.press('Space');
    await expect(announced).toContainText('Book the venue dropped in In progress');
    await expect(
      page.getByTestId('board-column-in_progress').getByTestId('task-card'),
    ).toContainText(['Book the venue']);
    await expect
      .poll(async () => (await taskNamed(owner, E, 'Book the venue')).status)
      .toBe('in_progress');
  });

  test('a task whose sub-event was deleted says so and can move to the whole event', async ({
    page,
  }) => {
    const owner = await signUp(page);
    const event = await weddingVia(owner);
    const E = `/v1/events/${event.id}`;
    const mehendi = (await list<SubEvent>(owner, `${E}/sub-events`)).find(
      (item) => item.name === 'Mehendi',
    )!;
    const res = await owner.delete(`${API_URL}${E}/sub-events/${mehendi.id}`, {
      headers: { ...headers, 'If-Match': `"${mehendi.version}"` },
    });
    expect(res.status()).toBe(204);

    await page.goto(`/events/${event.id}/tasks`);
    const row = page.getByTestId('task-row').filter({ hasText: 'Book the mehendi artist' });
    await expect(row.getByTestId('deleted-sub-event')).toBeVisible();
    await row.getByRole('button').click();
    const form = page.getByTestId('task-form');
    await expect(form.getByText(text('tasks.form.deletedHint'))).toBeVisible();
    await form.getByLabel(text('tasks.form.subEvent')).selectOption('');
    await form.getByRole('button', { name: text('tasks.form.save') }).click();
    await expect(row.getByTestId('deleted-sub-event')).toHaveCount(0);
    await expect
      .poll(async () => (await taskNamed(owner, E, 'Book the mehendi artist')).subEventId)
      .toBeNull();
  });

  test('My tasks lists what is assigned to me and opens it in its event', async ({ page }) => {
    const owner = await signUp(page);
    const event = await weddingVia(owner);
    const E = `/v1/events/${event.id}`;
    const me = (await (await owner.get(`${API_URL}${E}/me`)).json()) as {
      member: { id: string };
    };
    const task = await taskNamed(owner, E, 'Send the invitations');
    const res = await owner.put(`${API_URL}${E}/tasks/${task.id}/assignees`, {
      headers: { ...headers, 'If-Match': `"${task.version}"` },
      data: { memberIds: [me.member.id] },
    });
    expect(res.status()).toBe(200);

    await page.goto('/app');
    const mine = page.getByTestId('my-tasks');
    await mine.getByRole('link', { name: /Send the invitations/ }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${event.id}/tasks\\?task=${task.id}`));
    await expect(page.getByTestId('task-form').getByLabel(text('tasks.form.title'))).toHaveValue(
      'Send the invitations',
    );
  });
});
