import { randomInt, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

// Expected text comes from the translation file, so copy edits don't break the tests.
const auth = (
  JSON.parse(readFileSync(new URL('../messages/en.json', import.meta.url), 'utf8')) as {
    auth: {
      signIn: Record<string, string>;
      welcome: Record<string, string>;
      errors: Record<string, string>;
      signOut: string;
    };
  }
).auth;

/** Mailpit's API: the compose service locally, the job's service container in CI. */
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

/**
 * Real sign-in against the API and worker Playwright starts: the code travels through the
 * outbox, relay and email queue into Mailpit, where the test reads it.
 */
async function codeFromMailpit(email: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const res = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    const { messages } = (await res.json()) as { messages: { Subject: string }[] };
    const code = messages[0]?.Subject.match(/^(\d{6}) /)?.[1];
    if (code) return code;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No sign-in code for ${email} in Mailpit`);
}

// A fresh client IP per test: per-IP sign-in limits never trip on repeated local runs.
test.use({
  extraHTTPHeaders: {
    'X-Forwarded-For': `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`,
  },
});

const newEmail = () => `e2e-${randomUUID()}@test.local`;

async function requestCode(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel(auth.signIn.emailLabel!).fill(email);
  await page.getByRole('button', { name: auth.signIn.continueWithEmail }).click();
  await expect(page.getByRole('heading', { name: auth.signIn.codeTitle })).toBeVisible();
}

test.describe('sign-in', () => {
  test('says so when the API cannot be reached, instead of spinning forever', async ({ page }) => {
    await page.route('**/v1/auth/**', (route) => route.abort('connectionrefused'));
    await page.goto('/sign-in');
    await page.getByLabel(auth.signIn.emailLabel!).fill(newEmail());
    const button = page.getByRole('button', { name: auth.signIn.continueWithEmail });
    await button.click();

    await expect(page.locator('#email-error')).toHaveText(auth.errors.unreachable!);
    await expect(button).toBeEnabled();
    await expect(button).not.toHaveAttribute('aria-busy');
  });

  test('a new account signs in with an emailed code, sets a name and reaches the app', async ({
    page,
  }) => {
    const email = newEmail();
    await page.goto('/app');
    // Signed out: the session gate sends us to sign-in.
    await expect(page).toHaveURL(/\/sign-in$/);

    await requestCode(page, email);
    await page.getByTestId('code-input').fill(await codeFromMailpit(email));

    // New account: no name yet, so Welcome comes first.
    await expect(page).toHaveURL(/\/welcome$/, { timeout: 10_000 });
    await page.getByLabel(auth.welcome.nameLabel!).fill('Neha Verma');
    await page.getByLabel(auth.welcome.phoneLabel!).fill('9876543210');
    await page.getByRole('button', { name: auth.welcome.continue }).click();

    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    if (test.info().project.name === 'desktop') {
      await expect(page.getByTestId('signed-in-user')).toContainText('Neha Verma');
    }
  });

  test('a wrong code shows an error and keeps you on the code step', async ({ page }) => {
    const email = newEmail();
    await requestCode(page, email);
    const code = await codeFromMailpit(email);
    const wrong = code === '000000' ? '111111' : '000000';

    await page.getByTestId('code-input').fill(wrong);
    await expect(page.locator('#code-error')).toHaveText(auth.errors.invalidCode!);
    await expect(page.getByTestId('code-input')).toHaveAttribute('aria-invalid', 'true');

    // Typing again clears the error; the right code signs in.
    await page.getByTestId('code-input').fill(code);
    await expect(page).toHaveURL(/\/welcome$/, { timeout: 10_000 });
  });

  test('signing out returns to sign-in and protects the app again', async ({ page }) => {
    const email = newEmail();
    await requestCode(page, email);
    await page.getByTestId('code-input').fill(await codeFromMailpit(email));
    await expect(page).toHaveURL(/\/welcome$/, { timeout: 10_000 });
    await page.getByLabel(auth.welcome.nameLabel!).fill('Arjun Mehta');
    await page.getByRole('button', { name: auth.welcome.continue }).click();
    await expect(page).toHaveURL(/\/app$/);

    if (test.info().project.name === 'phone') {
      await page.getByRole('link', { name: 'More' }).click();
    }
    await page.getByRole('button', { name: auth.signOut }).locator('visible=true').first().click();
    await expect(page).toHaveURL(/\/sign-in$/);

    await page.goto('/app');
    await expect(page).toHaveURL(/\/sign-in$/);
  });
});
