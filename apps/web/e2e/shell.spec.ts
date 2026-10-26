import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

// Expected text comes from the translation file, so copy edits don't break the tests.
const app = (
  JSON.parse(readFileSync(new URL('../messages/en.json', import.meta.url), 'utf8')) as {
    app: {
      nav: Record<string, string>;
      status: Record<string, string>;
      quickAdd: Record<string, string>;
      sections: Record<string, { headline: string }>;
    };
  }
).app;

const READY_OK = {
  status: 'ok',
  checks: { postgres: { status: 'up', latencyMs: 1 }, redis: { status: 'up', latencyMs: 1 } },
};
const READY_DEGRADED = {
  status: 'error',
  checks: { postgres: { status: 'up', latencyMs: 1 }, redis: { status: 'down', error: 'refused' } },
};

/** The e2e job runs without the API; answer the readiness check here instead. */
async function mockReadiness(page: Page, response: 'ok' | 'degraded' | 'offline') {
  await page.route('**/v1/health/ready', (route) =>
    response === 'offline'
      ? route.abort('connectionrefused')
      : route.fulfill({
          status: response === 'ok' ? 200 : 503,
          json: response === 'ok' ? READY_OK : READY_DEGRADED,
        }),
  );
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

const isPhone = () => test.info().project.name === 'phone';
const visible = (page: Page, testId: string) => page.getByTestId(testId).locator('visible=true');

/** Desktop uses the sidebar; phone the bottom bar, or More for the other sections. */
function navLink(page: Page, label: string) {
  return page.getByRole('navigation', { name: app.nav.label! }).getByRole('link', { name: label });
}

test.describe('app shell', () => {
  test.beforeEach(async ({ page }) => {
    await mockReadiness(page, 'ok');
  });

  test('navigates between sections without errors', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/app');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('DevFest Bhopal 2026');
    await expect(navLink(page, app.nav.home!)).toHaveAttribute('aria-current', 'page');

    await navLink(page, app.nav.tasks!).click();
    await expect(page).toHaveURL(/\/app\/tasks$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(app.nav.tasks!);
    await expect(page.getByText(app.sections.tasks!.headline)).toBeVisible();
    await expect(navLink(page, app.nav.tasks!)).toHaveAttribute('aria-current', 'page');
    await expect(navLink(page, app.nav.home!)).not.toHaveAttribute('aria-current');

    expect(errors).toEqual([]);
  });

  test('reaches every section: sidebar on desktop, More on phone', async ({ page }) => {
    await page.goto('/app');
    if (isPhone()) {
      await navLink(page, app.nav.more!).click();
      await expect(page).toHaveURL(/\/app\/more$/);
      await page.getByRole('link', { name: app.nav.activity! }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(app.nav.activity!);
      // More stays highlighted on the sections it lists.
      await expect(navLink(page, app.nav.more!)).toHaveAttribute('aria-current', 'page');
    } else {
      for (const key of ['schedule', 'team', 'gallery', 'activity', 'settings']) {
        await expect(navLink(page, app.nav[key]!)).toBeVisible();
      }
      await expect(navLink(page, app.nav.more!)).toHaveCount(0);
    }
  });

  test('switches event', async ({ page }) => {
    await page.goto('/app');
    await visible(page, 'event-switcher').click();
    await page.getByRole('button', { name: /Sharma Wedding/ }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sharma Wedding');
    await expect(visible(page, 'event-switcher')).toContainText('Sharma Wedding');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('quick add opens a section', async ({ page }) => {
    await page.goto('/app');
    if (isPhone()) {
      await page.getByRole('button', { name: app.quickAdd.title! }).click();
      await expect(page.getByRole('dialog', { name: app.quickAdd.title! })).toBeVisible();
    } else {
      await page.getByRole('button', { name: app.quickAdd.add!, exact: true }).click();
    }
    await page.getByRole('link', { name: app.quickAdd.expense! }).click();
    await expect(page).toHaveURL(/\/app\/budget$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('unknown sections are 404', async ({ page }) => {
    const response = await page.goto('/app/nope');
    expect(response?.status()).toBe(404);
  });
});

test.describe('API status widget', () => {
  for (const [response, label] of [
    ['ok', app.status.ok],
    ['degraded', app.status.degraded],
    ['offline', app.status.offline],
  ] as const) {
    test(`shows ${response}`, async ({ page }) => {
      await mockReadiness(page, response);
      await page.goto('/app');
      const status = visible(page, 'api-status');
      await expect(status).toHaveAttribute('data-status', response);
      await expect(status).toContainText(label!);
    });
  }
});

/** Opens quick add and reads the sheet's transform two frames in, mid-animation. */
async function sheetTransformAtStart(page: Page) {
  return page.evaluate(async (label) => {
    document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return getComputedStyle(document.querySelector('[data-slot="sheet"]')!).transform;
  }, app.quickAdd.title!);
}

test.describe('sheet motion', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!isPhone(), 'Sheets are the phone and tablet pattern');
    await mockReadiness(page, 'ok');
    await page.goto('/app');
  });

  test('slides up normally', async ({ page }) => {
    expect(await sheetTransformAtStart(page)).not.toBe('none');
  });

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('fades without sliding', async ({ page }) => {
      expect(await sheetTransformAtStart(page)).toBe('none');
    });
  });
});
