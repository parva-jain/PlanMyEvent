import { expect, test, type Page } from '@playwright/test';

import { signUp, text, weddingVia } from './helpers';

/** A real 640×480 PNG, drawn in the page with a canvas. */
async function photo(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#e9c46a';
    context.fillRect(0, 0, 640, 480);
    context.fillStyle = '#264653';
    context.fillRect(120, 90, 400, 300);
    return canvas.toDataURL('image/png');
  });
  return Buffer.from(dataUrl.split(',')[1]!, 'base64');
}

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n',
);

test.describe('gallery and receipts', () => {
  test('upload a photo, see it processed, caption it and delete it', async ({ page }, testInfo) => {
    const owner = await signUp(page);
    const event = await weddingVia(owner);
    await page.goto(`/events/${event.id}/gallery`);
    await expect(page.getByTestId('gallery-empty')).toBeVisible();

    await page.getByTestId('gallery-input').setInputFiles({
      name: 'haldi.png',
      mimeType: 'image/png',
      buffer: await photo(page),
    });
    // Straight to storage, then the worker's WebP versions (entity.changed or the poll).
    const tile = page.getByTestId('photo');
    await expect(tile).toHaveCount(1, { timeout: 30_000 });
    await expect(page.getByTestId('gallery-count')).toContainText('1 photo');
    await expect(tile.locator('img')).toHaveAttribute('src', /-320\.webp$/);
    await page.screenshot({ path: testInfo.outputPath('gallery.png'), fullPage: true });

    const thumbUrl = (await tile.locator('img').getAttribute('src'))!;
    expect((await page.request.get(thumbUrl)).status()).toBe(200);
    await tile.click();
    const viewer = page.getByTestId('photo-viewer');
    await expect(viewer.locator('img')).toHaveAttribute('src', /-1600\.webp$/);
    await viewer.getByLabel(text('gallery.viewer.caption')).fill('Haldi morning');
    await viewer.getByRole('button', { name: text('gallery.viewer.save') }).click();
    await expect(viewer.getByRole('button', { name: text('gallery.viewer.save') })).toHaveCount(0);
    await viewer.getByRole('button', { name: text('gallery.viewer.delete') }).click();
    await viewer.getByRole('button', { name: text('gallery.viewer.confirmDelete') }).click();
    await expect(viewer).toHaveCount(0);
    await expect(page.getByTestId('gallery-empty')).toBeVisible();
    // A deleted photo stops being public straight away (media.purge).
    await expect
      .poll(async () => (await page.request.get(thumbUrl)).status(), {
        timeout: 15_000,
      })
      .toBe(404);
  });

  test('attach a PDF receipt to an expense', async ({ page }) => {
    const owner = await signUp(page);
    const event = await weddingVia(owner);
    await page.goto(`/events/${event.id}/budget`);
    await page.getByRole('button', { name: text('budget.addExpense') }).click();
    const form = page.getByTestId('expense-form');
    await form.getByLabel(text('budget.form.title')).fill('Tent hire');
    await form.getByLabel(text('budget.form.amount')).fill('45000');
    await form.getByLabel(text('budget.form.category')).selectOption({ label: 'Decor' });

    await form.getByTestId('receipt-input').setInputFiles({
      name: 'tent.pdf',
      mimeType: 'application/pdf',
      buffer: PDF,
    });
    await expect(form.getByTestId('receipt-status')).toHaveText(text('budget.receipt.attached'), {
      timeout: 30_000,
    });
    await expect(form.getByRole('button', { name: text('budget.receipt.view') })).toBeVisible();
    await form.getByRole('button', { name: text('budget.form.create') }).click();
    await expect(form).toHaveCount(0);

    // Opening the expense again shows its receipt.
    await page
      .getByTestId('budget-category')
      .filter({ hasText: 'Decor' })
      .getByRole('button', { name: /Decor/ })
      .first()
      .click();
    await page.getByTestId('expense-row').filter({ hasText: 'Tent hire' }).click();
    await expect(page.getByTestId('receipt-status')).toHaveText(text('budget.receipt.attached'));
  });
});
