import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

// Expected text comes from the translation file, so copy edits don't break the tests.
const home = (
  JSON.parse(readFileSync(new URL('../messages/en.json', import.meta.url), 'utf8')) as {
    home: Record<string, Record<string, unknown>>;
  }
).home;
const text = (section: string, ...path: string[]) =>
  path.reduce<unknown>(
    (node, key) => (node as Record<string, unknown>)[key],
    home[section],
  ) as string;

const SECTION_HEADINGS = [
  'problem-title',
  'how-title',
  'features-title',
  'use-cases-title',
  'guests-title',
  'ai-title',
  'pricing-title',
  'faq-title',
  'cta-title',
];

/** Records layout shifts (ignoring those right after input) from the very first paint. */
async function observeLayoutShifts(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as {
        value: number;
        hadRecentInput: boolean;
      }[]) {
        if (!entry.hadRecentInput) w.__cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

/** Scrolls to the bottom in viewport-sized steps, so every in-view animation runs. */
async function scrollThrough(page: Page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const step = page.viewportSize()!.height * 0.6;
  for (let y = 0; y <= height; y += step) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(60);
  }
}

/** Fails the test on any console error or uncaught exception. */
function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test.describe('home page', () => {
  test('renders every section without errors or layout shift', async ({ page }) => {
    const errors = collectErrors(page);
    await observeLayoutShifts(page);
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      text('hero', 'headlineEmphasis'),
    );
    await scrollThrough(page);
    for (const id of SECTION_HEADINGS) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
    await expect(page.getByRole('contentinfo')).toContainText(text('footer', 'copyright'));

    // Let the last entrances settle before reading the total.
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('header gains its background once the page scrolls', async ({ page }) => {
    await page.goto('/');
    const header = page.getByRole('banner');
    await expect(header).not.toHaveAttribute('data-scrolled');
    await page.evaluate(() => window.scrollTo(0, 200));
    await expect(header).toHaveAttribute('data-scrolled');
  });

  test('use-case tabs switch with the mouse and the keyboard', async ({ page }) => {
    await page.goto('/');
    const tabs = page.getByRole('tablist', { name: text('useCases', 'tabsLabel') });
    const weddings = tabs.getByRole('tab', { name: text('useCases', 'weddings', 'tab') });

    await weddings.click();
    await expect(weddings).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toContainText(text('useCases', 'weddings', 'title'));

    // Radix moves focus and selection together with the arrow keys.
    await page.keyboard.press('ArrowRight');
    await expect(
      tabs.getByRole('tab', { name: text('useCases', 'conferences', 'tab') }),
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toContainText(
      text('useCases', 'conferences', 'title'),
    );
  });

  test('FAQ answers open and close', async ({ page }) => {
    await page.goto('/');
    const question = page.getByRole('button', { name: text('faq', 'guests', 'q') });
    await question.click();
    await expect(question).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText(text('faq', 'guests', 'a'))).toBeVisible();
    await question.click();
    await expect(question).toHaveAttribute('aria-expanded', 'false');
  });

  test('AI teaser types its sentence, then shows the result cards', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('section[aria-labelledby="ai-title"]');
    const typed = section.locator('.inline-grid > span:nth-child(2)');
    const cards = section.getByRole('listitem');

    await section.scrollIntoViewIfNeeded();
    // Typing starts from empty, so the cards are still hidden at first.
    await expect(cards.first()).toHaveCSS('opacity', '0');
    await expect(typed).toHaveText(text('ai', 'example'), { timeout: 5_000 });
    await expect(cards.last()).toHaveCSS('opacity', '1');
  });
});

test.describe('home page with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('renders every section without errors or layout shift', async ({ page }) => {
    const errors = collectErrors(page);
    await observeLayoutShifts(page);
    await page.goto('/');
    await scrollThrough(page);
    for (const id of SECTION_HEADINGS) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('CSS motion switch is off and scroll-linked drift does not move', async ({ page }) => {
    await page.goto('/');
    expect(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--motion').trim(),
      ),
    ).toBe('0');

    // Halfway through the section is where drift would be largest.
    const bubble = page.locator('.drift-bubble').first();
    await bubble.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 200));
    await page.waitForTimeout(300);
    const transform = await bubble.evaluate((element) => getComputedStyle(element).transform);
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(transform);
  });

  test('AI teaser shows the full sentence and cards without typing', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('section[aria-labelledby="ai-title"]');
    await section.scrollIntoViewIfNeeded();
    // Read once, straight away: nothing should be mid-way through typing.
    expect(await section.locator('.inline-grid > span:nth-child(2)').textContent()).toBe(
      text('ai', 'example'),
    );
    await expect(section.getByRole('listitem').last()).toHaveCSS('opacity', '1');
    await expect(section.locator('.typewriter-caret')).toHaveCount(0);
  });
});
