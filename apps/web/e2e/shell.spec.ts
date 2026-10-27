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

/**
 * These tests cover the shell, not sign-in (auth.spec.ts does that): a fake signed-in user
 * passes the session gate without a running API.
 */
const SIGNED_IN = {
  user: {
    id: '0192f7aa-0000-7000-8000-000000000001',
    email: 'priya@example.com',
    name: 'Priya Sharma',
    phone: null,
    avatarUrl: null,
    locale: 'en',
  },
  workspace: {
    id: '0192f7aa-0000-7000-8000-000000000002',
    name: "Priya's workspace",
    plan: 'free',
  },
};

const event = (id: string, name: string, type: string) => ({
  id,
  slug: `${type}-abcd`,
  name,
  type,
  description: null,
  startsOn: '2026-11-14',
  endsOn: '2026-11-15',
  timeZone: 'Asia/Kolkata',
  status: 'planning',
  guestScope: 'whole_event',
  responseMode: 'open_registration',
  budgetPaise: null,
  version: 1,
  createdAt: '2026-10-27T00:00:00.000Z',
});
const DEVFEST = event('0192f7aa-0000-7000-8000-00000000000a', 'DevFest Bhopal 2026', 'conference');
const WEDDING = event('0192f7aa-0000-7000-8000-00000000000b', 'Sharma Wedding', 'wedding');
const list = (data: unknown[]) => ({ data, nextCursor: null, hasMore: false });
const HOME = `/events/${DEVFEST.id}`;

/**
 * These tests cover the shell, not sign-in or the API (auth.spec.ts and events.spec.ts do):
 * a fake signed-in user and fake event responses, so they run without the API.
 */
test.beforeEach(async ({ page }) => {
  await page.route('**/v1/me', (route) => route.fulfill({ json: SIGNED_IN }));
  await page.route('**/v1/me/events', (route) => route.fulfill({ json: list([DEVFEST, WEDDING]) }));
  for (const fake of [DEVFEST, WEDDING]) {
    await page.route(`**/v1/events/${fake.id}`, (route) => route.fulfill({ json: fake }));
    await page.route(`**/v1/events/${fake.id}/*`, (route) => route.fulfill({ json: list([]) }));
  }
});

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
    await page.goto(HOME);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('DevFest Bhopal 2026');
    await expect(navLink(page, app.nav.home!)).toHaveAttribute('aria-current', 'page');

    await navLink(page, app.nav.tasks!).click();
    await expect(page).toHaveURL(new RegExp(`${HOME}/tasks$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(app.nav.tasks!);
    await expect(page.getByText(app.sections.tasks!.headline)).toBeVisible();
    await expect(navLink(page, app.nav.tasks!)).toHaveAttribute('aria-current', 'page');
    await expect(navLink(page, app.nav.home!)).not.toHaveAttribute('aria-current');

    expect(errors).toEqual([]);
  });

  test('reaches every section: sidebar on desktop, More on phone', async ({ page }) => {
    await page.goto(HOME);
    if (isPhone()) {
      await navLink(page, app.nav.more!).click();
      await expect(page).toHaveURL(new RegExp(`${HOME}/more$`));
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
    await page.goto(HOME);
    await visible(page, 'event-switcher').click();
    await page.getByRole('button', { name: /Sharma Wedding/ }).click();
    // Switching keeps the section and moves to the other event's URL.
    await expect(page).toHaveURL(new RegExp(`/events/${WEDDING.id}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sharma Wedding');
    await expect(visible(page, 'event-switcher')).toContainText('Sharma Wedding');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('quick add opens a section', async ({ page }) => {
    await page.goto(HOME);
    if (isPhone()) {
      await page.getByRole('button', { name: app.quickAdd.title! }).click();
      await expect(page.getByRole('dialog', { name: app.quickAdd.title! })).toBeVisible();
    } else {
      await page.getByRole('button', { name: app.quickAdd.add!, exact: true }).click();
    }
    await page.getByRole('link', { name: app.quickAdd.expense! }).click();
    await expect(page).toHaveURL(new RegExp(`${HOME}/budget$`));
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('unknown sections show not found', async ({ page }) => {
    // Under the dynamic [eventId] route Next streams the shell first, so the status stays 200;
    // the page still renders not-found (with noindex, and signed-in pages aren't indexed).
    await page.goto(`${HOME}/nope`);
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
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
      await page.goto(HOME);
      const status = visible(page, 'api-status');
      await expect(status).toHaveAttribute('data-status', response);
      await expect(status).toContainText(label!);
    });
  }
});

/** Opens quick add and reads the sheet's transform two frames in, mid-animation. */
async function sheetTransformAtStart(page: Page) {
  // The session gate renders the shell once /v1/me answers.
  await expect(page.getByRole('button', { name: app.quickAdd.title! })).toBeVisible();
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
    await page.goto(HOME);
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
