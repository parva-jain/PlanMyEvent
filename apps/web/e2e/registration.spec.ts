import type { CreatedEvent, SubEvent } from '@pme/contracts';
import { expect, test, type Page } from '@playwright/test';

import { API_URL, linkFromMailpit, newEmail, randomIp, signUp, text, WEB_ORIGIN } from './helpers';

const headers = { Origin: WEB_ORIGIN };

/**
 * Turnstile in tests: a stand-in for Cloudflare's script that "solves" the check at once
 * (the API's always-pass test secret accepts any token).
 */
async function stubTurnstile(page: Page) {
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.turnstile = {
        render: (el, options) => { setTimeout(() => options.callback('e2e-token'), 50); return 'w1'; },
        reset: () => {}, remove: () => {},
      };`,
    }),
  );
}

/** A conference taking open registration for the whole event; its keynote is public, 2 places. */
async function conference(page: Page) {
  const owner = await signUp(page, 'Rohan Verma');
  const res = await owner.post(`${API_URL}/v1/events`, {
    headers,
    data: {
      templateKey: 'conference',
      name: 'DevFest Bhopal',
      startsOn: '2027-03-10',
      endsOn: '2027-03-11',
      timeZone: 'Asia/Kolkata',
    },
  });
  expect(res.status()).toBe(201);
  const event = (await res.json()) as CreatedEvent;
  const E = `${API_URL}/v1/events/${event.id}`;
  expect(
    (
      await owner.patch(E, {
        headers: { ...headers, 'If-Match': `"${event.version}"` },
        data: { status: 'planning', responseMode: 'open_registration' },
      })
    ).ok(),
  ).toBe(true);
  const [keynote] = ((await (await owner.get(`${E}/sub-events`)).json()) as { data: SubEvent[] })
    .data;
  expect(
    (
      await owner.patch(`${E}/sub-events/${keynote!.id}`, {
        headers: { ...headers, 'If-Match': `"${keynote!.version}"` },
        data: { visibility: 'public', capacity: 2 },
      })
    ).ok(),
  ).toBe(true);
  return { owner, event, keynote: keynote! };
}

test.describe('open registration', () => {
  test('a visitor registers on the public page, gets the link by email and cancels there', async ({
    page,
    browser,
  }, testInfo) => {
    const { event, keynote } = await conference(page);

    // Each visitor its own address: registration allows 5 a minute per IP.
    const visitorContext = await browser.newContext({
      extraHTTPHeaders: { 'X-Forwarded-For': randomIp() },
    });
    const visitor = await visitorContext.newPage();
    await stubTurnstile(visitor);
    await visitor.goto(`/e/${event.slug}`);
    await expect(visitor.getByRole('heading', { level: 1 })).toHaveText('DevFest Bhopal');
    await expect(visitor.getByTestId('public-schedule')).toContainText(keynote.name);
    await expect(visitor.getByTestId('spots-left')).toContainText('2 places left');

    await visitor.screenshot({ path: testInfo.outputPath('public-page.png'), fullPage: true });
    const email = newEmail();
    const form = visitor.getByTestId('register-form');
    await form.getByLabel(text('publicEvent.form.name')).fill('Anil Kumar');
    await form.getByLabel(text('publicEvent.form.email'), { exact: true }).fill(email);
    await form.getByRole('button', { name: text('publicEvent.form.more') }).click();
    await form.getByRole('button', { name: text('publicEvent.form.submit') }).click();
    await expect(visitor.getByTestId('registered')).toContainText(
      text('publicEvent.form.doneTitle'),
    );

    // The confirmation email's link opens their registration; they cancel it.
    const link = await linkFromMailpit(email, '/i/');
    await visitor.goto(new URL(link).pathname);
    const card = visitor.getByTestId('registration');
    await expect(card).toContainText('2 people');
    await card.getByRole('button', { name: text('invite.registration.cancel') }).click();
    await card.getByRole('button', { name: text('invite.registration.yesCancel') }).click();
    await expect(card).toContainText(text('invite.registration.cancelledTitle'));
    await visitor.screenshot({ path: testInfo.outputPath('cancelled.png'), fullPage: true });
    await expect(
      card.getByRole('link', { name: text('invite.registration.registerAgain') }),
    ).toHaveAttribute('href', `/e/${event.slug}`);
    await visitorContext.close();
  });

  test('organizers see registrations, add a walk-in and share the public link', async ({
    page,
    browser,
  }) => {
    const { event } = await conference(page);
    // Each visitor its own address: registration allows 5 a minute per IP.
    const visitorContext = await browser.newContext({
      extraHTTPHeaders: { 'X-Forwarded-For': randomIp() },
    });
    const visitor = await visitorContext.newPage();
    await stubTurnstile(visitor);
    await visitor.goto(`/e/${event.slug}`);
    const form = visitor.getByTestId('register-form');
    await form.getByLabel(text('publicEvent.form.name')).fill('Meera Joshi');
    await form.getByLabel(text('publicEvent.form.email'), { exact: true }).fill(newEmail());
    await form.getByRole('button', { name: text('publicEvent.form.submit') }).click();
    await expect(visitor.getByTestId('registered')).toBeVisible();
    await visitorContext.close();

    await page.goto(`/events/${event.id}/people`);
    await page.getByRole('tab', { name: text('people.tabs.registrations') }).click();
    await expect(page.getByTestId('registrant')).toContainText('Meera Joshi');

    await page.getByRole('button', { name: text('people.registrations.add') }).click();
    const panel = page.getByTestId('add-registration');
    await panel.getByLabel(text('people.registrations.form.name')).fill('Ravi at the door');
    await panel.getByRole('button', { name: text('people.registrations.form.save') }).click();
    await expect(
      page.getByTestId('registrant').filter({ hasText: 'Ravi at the door' }),
    ).toContainText(text('people.attendance.checked_in'));

    await page.goto(`/events/${event.id}/settings`);
    await expect(page.getByTestId('public-link')).toContainText(`/e/${event.slug}`);
  });

  test('a private event has no public page', async ({ page }) => {
    const owner = await signUp(page);
    const res = await owner.post(`${API_URL}/v1/events`, {
      headers,
      data: {
        templateKey: 'wedding',
        name: 'Sharma Wedding',
        startsOn: '2027-01-10',
        endsOn: '2027-01-12',
        timeZone: 'Asia/Kolkata',
      },
    });
    const event = (await res.json()) as CreatedEvent;
    const response = await page.goto(`/e/${event.slug}`);
    expect(response?.status()).toBe(404);
  });
});
