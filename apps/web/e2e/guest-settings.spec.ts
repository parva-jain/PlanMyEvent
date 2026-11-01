import type { Household, Invitation, InvitationShare, SubEvent } from '@pme/contracts';
import { expect, test } from '@playwright/test';

import { API_URL, signUp, text, WEB_ORIGIN, weddingVia } from './helpers';

const headers = { Origin: WEB_ORIGIN };

test.describe('people and responses settings', () => {
  test('with invite + RSVP chosen, a guest replies through their real link and the team sees it', async ({
    page,
    browser,
  }) => {
    const owner = await signUp(page);
    const event = await weddingVia(owner);
    const E = `${API_URL}/v1/events/${event.id}`;
    await page.goto(`/events/${event.id}/settings`);
    const settings = page.getByTestId('guest-settings');
    await settings.getByRole('radio', { name: text('settings.guests.modes.invite_rsvp') }).click();
    await expect(
      settings.getByRole('radio', { name: text('settings.guests.modes.invite_rsvp') }),
    ).toHaveAttribute('aria-checked', 'true');

    const sharmas = (await (
      await owner.post(`${E}/households`, {
        headers,
        data: { name: 'Sharma family', expectedCount: 2 },
      })
    ).json()) as Household;
    const card = (await (
      await owner.post(`${E}/invitations`, { headers, data: { householdId: sharmas.id } })
    ).json()) as Invitation;
    const share = (await (
      await owner.get(`${E}/invitations/${card.id}/share`)
    ).json()) as InvitationShare;

    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await guest.goto(new URL(share.url).pathname);
    const form = guest.getByTestId('rsvp-form');
    await form.getByRole('radio', { name: text('invite.yes') }).click();
    await form.getByRole('button', { name: text('invite.more') }).click();
    await form.getByRole('button', { name: text('invite.send') }).click();
    await expect(guest.getByTestId('rsvp-done')).toContainText('3 of you are coming');
    await guestContext.close();

    await page.goto(`/events/${event.id}/people`);
    await page.getByRole('tab', { name: text('people.tabs.responses') }).click();
    const row = page.getByTestId('response-row').filter({ hasText: 'Sharma family' });
    await expect(row).toContainText(text('people.attendance.confirmed'));
    await expect(row).toContainText('3 people');
  });

  test('switching to separate lists runs as a job and gives each sub-event its own response mode', async ({
    page,
  }) => {
    const owner = await signUp(page);
    const event = await weddingVia(owner);
    const subEvents = (
      (await (await owner.get(`${API_URL}/v1/events/${event.id}/sub-events`)).json()) as {
        data: SubEvent[];
      }
    ).data;
    await page.goto(`/events/${event.id}/settings`);
    const settings = page.getByTestId('guest-settings');
    await expect(settings.getByTestId('guest-scope')).toHaveText(
      text('settings.guests.wholeEvent'),
    );

    await settings.getByRole('button', { name: text('settings.guests.toPerSubEvent') }).click();
    const dialog = page.getByTestId('guest-scope-dialog');
    await dialog.getByRole('button', { name: text('settings.guests.switch') }).click();
    await expect(dialog).toContainText(text('settings.guests.done'), { timeout: 30_000 });
    await dialog.getByRole('button', { name: text('settings.guests.close') }).click();

    await expect(settings.getByTestId('guest-scope')).toHaveText(
      text('settings.guests.perSubEvent'),
    );
    await expect(settings.getByTestId('sub-event-modes').getByRole('listitem')).toHaveCount(
      subEvents.length,
    );
  });
});
