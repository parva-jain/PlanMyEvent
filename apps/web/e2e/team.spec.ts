import type { CreatedMemberInvite, Role } from '@pme/contracts';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { API_URL, isPhone, signUp, text, WEB_ORIGIN, weddingVia } from './helpers';

/** A shareable invite link through the API, for tests about joining. */
async function linkInvite(api: APIRequestContext, eventId: string, roleName = 'Viewer') {
  const roles = (
    (await (await api.get(`${API_URL}/v1/events/${eventId}/roles`)).json()) as { data: Role[] }
  ).data;
  const res = await api.post(`${API_URL}/v1/events/${eventId}/member-invites`, {
    headers: { Origin: WEB_ORIGIN },
    data: { grants: [{ roleId: roles.find((role) => role.name === roleName)!.id }], maxUses: 5 },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as CreatedMemberInvite;
}

/** Signs the owner up in their own browser context and creates a wedding. */
async function ownerWithWedding(page: Page) {
  const context = await page.context().browser()!.newContext();
  const ownerPage = await context.newPage();
  const api = await signUp(ownerPage, 'Priya Sharma');
  const event = await weddingVia(api);
  return { api, event, context, ownerPage };
}

test.describe('team', () => {
  test('the owner invites by link; the new member joins as Viewer and sees less', async ({
    page,
  }) => {
    const { event, context, ownerPage } = await ownerWithWedding(page);

    // Owner: Team page lists them as Owner and creates a shareable link.
    await ownerPage.goto(`/events/${event.id}/team`);
    await expect(ownerPage.getByTestId('member')).toHaveCount(1);
    await expect(ownerPage.getByTestId('member')).toContainText('Owner');
    await ownerPage.getByRole('button', { name: text('team.invite.title') }).click();
    const panel = ownerPage.getByRole('dialog', { name: text('team.invite.title') });
    await panel.getByRole('tab', { name: text('team.invite.byLink') }).click();
    await panel
      .getByLabel(text('team.grant.role'), { exact: true })
      .selectOption({ label: 'Viewer' });
    await panel.getByRole('button', { name: text('team.invite.createLink') }).click();
    const link = await panel.getByLabel(text('team.invite.linkReady')).inputValue();
    expect(link).toMatch(/\/join\/[A-Za-z0-9_-]{43}$/);
    await context.close();

    // Invitee: signed in, opens the link and joins.
    await signUp(page, 'Rahul Verma');
    await page.goto(new URL(link).pathname);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Sharma Wedding');
    await expect(page.getByText('Viewer', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: text('join.join') }).click();
    await expect(page.getByRole('heading', { name: text('join.joinedTitle') })).toBeVisible();
    await page.getByRole('link', { name: text('join.openEvent') }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sharma Wedding');

    // A Viewer has no Settings in the nav, no quick add, and Settings by URL says why.
    if (!isPhone()) {
      const nav = page.getByRole('navigation', { name: text('app.nav.label') });
      await expect(nav.getByRole('link', { name: text('app.nav.team') })).toBeVisible();
      await expect(nav.getByRole('link', { name: text('app.nav.settings') })).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: text('app.quickAdd.add'), exact: true }),
      ).toHaveCount(0);
    }
    await page.goto(`/events/${event.id}/settings`);
    await expect(page.getByRole('heading', { name: text('app.noAccess.title') })).toBeVisible();

    // My events shows the role.
    await page.goto('/app');
    await expect(page.getByTestId('event-roles')).toContainText('Viewer');
  });

  test('signed out, a join link offers sign-in and names the invite there', async ({
    page,
    browser,
  }) => {
    const ownerContext = await browser.newContext();
    const api = await signUp(await ownerContext.newPage(), 'Priya Sharma');
    const event = await weddingVia(api);
    const invite = await linkInvite(api, event.id, 'Helper');
    await ownerContext.close();

    await page.goto(`/join/${invite.token}`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Sharma Wedding');
    await page.getByRole('link', { name: text('join.signInToJoin') }).click();
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=%2Fjoin%2F${invite.token}$`));
    await expect(page.getByText(/Sign in to join Priya Sharma's team/)).toBeVisible();
  });

  test('revoked and unknown links explain themselves', async ({ page }) => {
    const api = await signUp(page, 'Priya Sharma');
    const event = await weddingVia(api);
    const invite = await linkInvite(api, event.id);
    await api.delete(`${API_URL}/v1/events/${event.id}/member-invites/${invite.id}`, {
      headers: { Origin: WEB_ORIGIN },
    });

    await page.goto(`/join/${invite.token}`);
    await expect(
      page.getByRole('heading', { name: text('join.dead.revoked.title') }),
    ).toBeVisible();
    await page.goto('/join/not-a-real-token');
    await expect(
      page.getByRole('heading', { name: text('join.dead.invalid.title') }),
    ).toBeVisible();
  });

  test("the owner changes a member's role, scoped to one sub-event", async ({ page, browser }) => {
    const api = await signUp(page, 'Priya Sharma');
    const event = await weddingVia(api);
    const invite = await linkInvite(api, event.id, 'Viewer');
    const memberContext = await browser.newContext();
    const memberApi = await signUp(await memberContext.newPage(), 'Neha Gupta');
    expect(
      (
        await memberApi.post(`${API_URL}/v1/member-invites/${invite.token}/accept`, {
          headers: { Origin: WEB_ORIGIN },
        })
      ).ok(),
    ).toBe(true);
    await memberContext.close();

    await page.goto(`/events/${event.id}/team`);
    const neha = page.getByTestId('member').filter({ hasText: 'Neha Gupta' });
    await expect(neha).toContainText('Viewer');
    await neha.click();
    const panel = page.getByRole('dialog', { name: text('team.member.title') });
    await panel
      .getByLabel(text('team.grant.role'), { exact: true })
      .selectOption({ label: 'Editor' });
    await panel.getByText(text('team.grant.some.title')).click();
    await panel.getByRole('button', { name: text('team.member.save') }).click();
    await expect(panel).toBeHidden();
    // The first sub-event (Haldi) is ticked when switching to "only some".
    await expect(neha).toContainText('Editor · Haldi');
  });

  test('roles: create a custom role; the Owner role is read-only', async ({ page }) => {
    const api = await signUp(page, 'Priya Sharma');
    const event = await weddingVia(api);

    await page.goto(`/events/${event.id}/team/roles`);
    await expect(page.getByTestId('role')).toHaveCount(5);
    await page.getByRole('link', { name: text('team.roles.create') }).click();
    await page.getByLabel(text('team.roles.name')).fill('Catering Coordinator');
    await page.getByRole('switch', { name: text('team.permissions.budget.view.label') }).click();
    await expect(page.getByTestId('role-summary')).toContainText(
      text('team.permissions.budget.view.label'),
    );
    await page
      .getByRole('button', { name: text('team.roles.createSave') })
      .first()
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Edit role: Catering Coordinator',
    );

    await page.getByRole('link', { name: text('team.roles.backToRoles') }).click();
    await expect(page.getByTestId('role')).toHaveCount(6);
    await page.getByTestId('role').filter({ hasText: 'Owner' }).click();
    await expect(page.getByText(text('team.roles.ownerLocked'))).toBeVisible();
    await expect(page.getByRole('switch').first()).toBeDisabled();
  });
});
