import type { CreatedMemberInvite, Member, Role, SubEvent } from '@pme/contracts';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { API_URL, signUp, text, WEB_ORIGIN, weddingVia } from './helpers';

const headers = { Origin: WEB_ORIGIN };

async function list<T>(api: APIRequestContext, path: string): Promise<T[]> {
  return ((await (await api.get(`${API_URL}${path}`)).json()) as { data: T[] }).data;
}

/**
 * The owner (this test's page) and an Editor in a second browser, both signed in to one
 * wedding. The Editor writes through the API, as another device would.
 */
async function ownerAndEditor(page: Page) {
  const owner = await signUp(page, 'Priya Sharma');
  const event = await weddingVia(owner);
  const E = `/v1/events/${event.id}`;
  const editorRole = (await list<Role>(owner, `${E}/roles`)).find(
    (role) => role.name === 'Editor',
  )!;
  const invite = (await (
    await owner.post(`${API_URL}${E}/member-invites`, {
      headers,
      data: { grants: [{ roleId: editorRole.id }] },
    })
  ).json()) as CreatedMemberInvite;

  const context = await page.context().browser()!.newContext();
  const editorPage = await context.newPage();
  const editor = await signUp(editorPage, 'Rahul Verma');
  expect(
    (await editor.post(`${API_URL}/v1/member-invites/${invite.token}/accept`, { headers })).ok(),
  ).toBe(true);
  return { owner, editor, editorPage, context, event, E };
}

async function rename(api: APIRequestContext, E: string, from: string, to: string) {
  const subEvent = (await list<SubEvent>(api, `${E}/sub-events`)).find((s) => s.name === from)!;
  const res = await api.patch(`${API_URL}${E}/sub-events/${subEvent.id}`, {
    headers: { ...headers, 'If-Match': `"${subEvent.version}"` },
    data: { name: to },
  });
  expect(res.status()).toBe(200);
}

test.describe('live updates and undo', () => {
  test("someone else's change appears without a reload; the owner undoes it from Activity", async ({
    page,
  }) => {
    const { editor, context, event, E } = await ownerAndEditor(page);
    const rows = page.getByTestId('sub-event');

    await page.goto(`/events/${event.id}/schedule`);
    await expect(rows.filter({ hasText: 'Haldi' })).toHaveCount(1);
    await rename(editor, E, 'Haldi', 'Haldi ceremony');
    // Socket signal → re-fetch → the row changes, glowing with who did it.
    await expect(rows.filter({ hasText: 'Haldi ceremony' })).toHaveCount(1);
    await expect(page.getByText('Rahul just updated this')).toBeVisible();

    await page.goto(`/events/${event.id}/activity`);
    const entries = page.getByTestId('activity-entry');
    const renamed = entries.filter({ hasText: 'Rahul Verma updated Haldi ceremony' });
    await expect(renamed).toContainText('Name: Haldi → Haldi ceremony');
    await renamed.getByRole('button', { name: /^Undo/ }).click();
    await expect(renamed).toContainText('Undone by Priya Sharma');
    await expect(renamed.getByRole('button', { name: /^Undo/ })).toHaveCount(0);
    // The undo is an entry of its own, at the top.
    await expect(entries.first()).toContainText('Priya Sharma updated Haldi');

    // A change made while the log is open slides in at the top.
    await rename(editor, E, 'Haldi', 'Haldi at noon');
    await expect(entries.first()).toContainText('Rahul Verma updated Haldi at noon');

    await page.goto(`/events/${event.id}/schedule`);
    await expect(rows.filter({ hasText: 'Haldi at noon' })).toHaveCount(1);
    await context.close();
  });

  test('deleting a venue offers undo for a few seconds', async ({ page }) => {
    const owner = await signUp(page, 'Priya Sharma');
    const event = await weddingVia(owner);
    await page.goto(`/events/${event.id}/schedule`);
    const venues = page.getByTestId('venues');
    await expect(venues).toContainText('Radisson Lawn');

    await page.getByRole('button', { name: 'Remove Radisson Lawn' }).click();
    await expect(venues).not.toContainText('Radisson Lawn');
    const snackbar = page.getByTestId('snackbar');
    await expect(snackbar).toContainText('Radisson Lawn deleted');
    // Hovering pauses the 5 s countdown, so a slow machine can't miss the window.
    await snackbar.hover();
    await snackbar.getByRole('button', { name: text('app.snackbar.undo') }).click();
    await expect(venues).toContainText('Radisson Lawn');
    await expect(snackbar).toHaveCount(0);
  });

  test('a member removed while looking at the event is told at once', async ({ page }) => {
    const { owner, editorPage, context, event, E } = await ownerAndEditor(page);
    await editorPage.goto(`/events/${event.id}/schedule`);
    await expect(editorPage.getByTestId('sub-event').first()).toBeVisible();

    const rahul = (await list<Member>(owner, `${E}/members`)).find((m) => !m.isOwner)!;
    const res = await owner.delete(`${API_URL}${E}/members/${rahul.id}`, {
      headers: { ...headers, 'If-Match': `"${rahul.version}"` },
    });
    expect(res.status()).toBe(204);
    await expect(editorPage.getByText(text('app.event.removed'))).toBeVisible();
    await context.close();
  });
});
