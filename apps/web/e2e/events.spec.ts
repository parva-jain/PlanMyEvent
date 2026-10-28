import type { Event } from '@pme/contracts';
import { expect, test, type Page } from '@playwright/test';

import { API_URL, isPhone, signUp, text, WEB_ORIGIN, weddingVia } from './helpers';

const nav = (page: Page, label: string) =>
  page.getByRole('navigation', { name: text('app.nav.label') }).getByRole('link', { name: label });

test.describe('create an event', () => {
  test('a new user goes from My events through the wizard to their event', async ({ page }) => {
    await signUp(page);
    await page.goto('/app');
    await expect(
      page.getByRole('heading', { name: text('app.myEvents.emptyTitle') }),
    ).toBeVisible();
    await page.getByRole('link', { name: text('app.myEvents.createFirst') }).click();

    // Step 1: template.
    await expect(page).toHaveURL(/\/events\/new$/);
    const next = page.getByRole('button', { name: text('wizard.continue') });
    await expect(next).toBeDisabled();
    await page.getByTestId('template-wedding').click();
    await expect(page.getByTestId('template-wedding')).toHaveAttribute('aria-checked', 'true');
    await next.click();

    // Step 2: details, with validation and the live preview.
    await next.click();
    await expect(page.getByText(text('wizard.errors.name'))).toBeVisible();
    // India is the default even where the browser lists it as Asia/Calcutta.
    await expect(page.getByLabel(text('wizard.details.timeZone'))).toHaveValue('Asia/Kolkata');
    await page.getByLabel(text('wizard.details.name')).fill('Verma Wedding');
    await page.getByLabel(text('wizard.details.startsOn')).fill('2026-12-10');
    await page.getByLabel(text('wizard.details.endsOn')).fill('2026-12-12');
    await page.getByLabel(text('wizard.details.venue')).fill('Radisson Lawn');
    await expect(
      page.getByRole('complementary', { name: text('wizard.details.preview') }),
    ).toContainText('Verma Wedding');
    await next.click();

    // Step 3: review shows the starter sub-events the API will create.
    await expect(page.getByTestId('review-sub-events').getByRole('listitem')).toHaveCount(5);
    await page.getByRole('button', { name: text('wizard.create') }).click();

    await expect(page.getByRole('heading', { name: text('wizard.done.title') })).toBeVisible();
    await page.getByRole('link', { name: text('wizard.done.open') }).click();
    await expect(page).toHaveURL(/\/events\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Verma Wedding');

    // My events lists it.
    await page.goto('/app');
    await expect(page.getByTestId('event-card')).toHaveCount(1);
    await expect(page.getByTestId('event-card')).toContainText('Verma Wedding');
  });
});

test.describe('schedule', () => {
  test('shows starter sub-events in the event time zone; add, edit and delete one', async ({
    page,
  }) => {
    const api = await signUp(page);
    const event = await weddingVia(api);
    await page.goto(`/events/${event.id}/schedule`);

    const rows = page.getByTestId('sub-event');
    await expect(rows).toHaveCount(5);
    // Haldi is 10:00–13:00 in India time, whatever the browser's own zone.
    await expect(rows.first()).toContainText('10:00–13:00');
    await expect(rows.first()).toContainText('Haldi');
    await expect(rows.first()).toContainText('Radisson Lawn');

    // Add.
    await page.getByRole('button', { name: text('schedule.add') }).click();
    const panel = page.getByRole('dialog', { name: text('schedule.newTitle') });
    await panel.getByLabel(text('schedule.form.name')).fill('After party');
    await panel.getByLabel(text('schedule.form.date')).fill('2026-12-12');
    await panel.getByLabel(text('schedule.form.start')).fill('23:00');
    await panel.getByLabel(text('schedule.form.end')).fill('02:00');
    await panel.getByRole('button', { name: text('schedule.form.create') }).click();
    await expect(panel).toBeHidden();
    await expect(rows).toHaveCount(6);
    // Ends after midnight: marked +1.
    await expect(rows.filter({ hasText: 'After party' })).toContainText('23:00–02:00 +1');

    // Edit.
    await rows.filter({ hasText: 'After party' }).click();
    const edit = page.getByRole('dialog', { name: text('schedule.editTitle') });
    await edit.getByLabel(text('schedule.form.capacity')).fill('80');
    await edit.getByRole('button', { name: text('schedule.form.save') }).click();
    await expect(edit).toBeHidden();
    await expect(rows.filter({ hasText: 'After party' })).toContainText('80');

    // Delete takes two taps.
    await rows.filter({ hasText: 'After party' }).click();
    await page.getByRole('button', { name: text('schedule.form.delete') }).click();
    await page.getByRole('button', { name: text('schedule.form.confirmDelete') }).click();
    await expect(rows).toHaveCount(5);
  });

  test('quick add opens a new sub-event', async ({ page }) => {
    const api = await signUp(page);
    const event = await weddingVia(api);
    await page.goto(`/events/${event.id}`);
    if (isPhone()) {
      await page.getByRole('button', { name: text('app.quickAdd.title') }).click();
    } else {
      await page.getByRole('button', { name: text('app.quickAdd.add'), exact: true }).click();
    }
    await page.getByRole('link', { name: text('app.quickAdd.session') }).click();
    await expect(page).toHaveURL(new RegExp(`/events/${event.id}/schedule`));
    await expect(page.getByRole('dialog', { name: text('schedule.newTitle') })).toBeVisible();
  });
});

test.describe('settings', () => {
  test('saves details, and recovers when someone else saved first (409)', async ({ page }) => {
    const api = await signUp(page);
    const event = await weddingVia(api);
    await page.goto(`/events/${event.id}/settings`);

    const name = page.getByLabel(text('settings.details.name'));
    await name.fill('Sharma–Verma Wedding');
    await page.getByRole('button', { name: text('settings.details.save') }).click();
    await expect(
      page.getByRole('status').filter({ hasText: text('settings.details.saved') }),
    ).toBeVisible();

    // Another organiser renames it from elsewhere (version 2 → 3).
    const other = await api.patch(`${API_URL}/v1/events/${event.id}`, {
      headers: { Origin: WEB_ORIGIN, 'If-Match': '"2"' },
      data: { name: 'Renamed elsewhere' },
    });
    expect(((await other.json()) as Event).version).toBe(3);

    // Our stale save gets 409; the form shows their version to re-apply onto.
    await name.fill('My stale edit');
    await page.getByRole('button', { name: text('settings.details.save') }).click();
    await expect(page.getByText(text('settings.details.conflict'))).toBeVisible();
    await expect(name).toHaveValue('Renamed elsewhere');

    // Saving again now works.
    await name.fill('Final name');
    await page.getByRole('button', { name: text('settings.details.save') }).click();
    await expect(
      page.getByRole('status').filter({ hasText: text('settings.details.saved') }),
    ).toBeVisible();
    if (!isPhone()) {
      await nav(page, text('app.nav.home')).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Final name');
    }
  });
});

test.describe('access', () => {
  test("someone else's event shows not found", async ({ page, browser }) => {
    const ownerContext = await browser.newContext();
    const ownerPage = await ownerContext.newPage();
    const event = await weddingVia(await signUp(ownerPage, 'Owner'));
    await ownerContext.close();

    await signUp(page, 'Stranger');
    await page.goto(`/events/${event.id}`);
    await expect(page.getByText(text('app.event.notFound'))).toBeVisible();
  });
});
