import { test, expect } from '@playwright/test';
import { register, uniqueEmail, clickChannel, TEST_PASSWORD } from './helpers';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEST_PNG_PATH = path.join(__dirname, 'test-fixtures', 'test-image.png');

// Regression test for: on an installed iOS PWA (display:standalone, viewport-fit=cover,
// black-translucent status bar), the image lightbox could not be closed — the X sat under
// the status bar/notch (no safe-area inset) and the tap-outside onClick on a plain <div>
// doesn't fire on iOS without cursor:pointer. The fix offsets the close button by the
// safe-area inset, makes the backdrop iOS-tappable, and adds a browser-back exit.
test.describe('Image lightbox exit (mobile PWA)', () => {
  async function openLightbox(page: import('@playwright/test').Page) {
    await register(page, `Lightbox${Date.now()}`, uniqueEmail(), TEST_PASSWORD);
    await clickChannel(page, 'general');
    await page.waitForTimeout(500);

    const attachButton = page.getByTestId('attach-file-button');
    await expect(attachButton).toBeVisible();
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      attachButton.click(),
    ]);
    await fileChooser.setFiles(TEST_PNG_PATH);
    await expect(page.getByTestId('file-preview')).toBeVisible({ timeout: 5000 });

    const uniqueText = `lightbox exit ${Date.now()}`;
    const editor = page.locator('.ql-editor');
    await editor.click();
    await page.keyboard.type(uniqueText, { delay: 10 });
    await page.keyboard.press('Enter');

    const messageRow = page.locator('.group.relative.flex.px-5').filter({ hasText: uniqueText }).first();
    await expect(messageRow).toBeVisible({ timeout: 10000 });
    // dispatchEvent fires the button's onClick directly — the attachment <img> may not finish
    // loading in the test env, collapsing the button's hit area so a positional click misses it.
    await messageRow.getByTestId('image-thumbnail').dispatchEvent('click');
    await expect(page.getByTestId('image-lightbox')).toBeVisible({ timeout: 5000 });
    return uniqueText;
  }

  test('close button is offset by the safe-area inset (not hidden under the status bar)', async ({ page }) => {
    await openLightbox(page);
    const closeBtn = page.getByTestId('lightbox-close');
    await expect(closeBtn).toBeVisible();
    // The fix positions the button using env(safe-area-inset-top); assert the inline style is present.
    const style = await closeBtn.getAttribute('style');
    expect(style).toContain('safe-area-inset-top');
  });

  test('the X button closes the lightbox', async ({ page }) => {
    await openLightbox(page);
    await page.getByTestId('lightbox-close').click();
    await expect(page.getByTestId('image-lightbox')).not.toBeVisible();
  });

  test('tapping the backdrop closes the lightbox', async ({ page }) => {
    await openLightbox(page);
    // Click a corner of the overlay (backdrop, not the centered image).
    await page.getByTestId('image-lightbox').click({ position: { x: 5, y: 5 } });
    await expect(page.getByTestId('image-lightbox')).not.toBeVisible();
  });
});
