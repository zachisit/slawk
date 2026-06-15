import { test, expect } from '@playwright/test';
import { register, uniqueEmail, clickChannel, TEST_PASSWORD } from './helpers';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_PNG_PATH = path.join(__dirname, 'test-fixtures', 'test-image.png');

test.describe('File download in standalone PWA', () => {
  // Regression test: Slawk's manifest is display:standalone. On mobile the <a download>
  // attribute is ignored, so a download link with no target navigated the chrome-less PWA
  // window to the file and the user got stuck full-screen with no way back (had to kill the
  // app). The fix gives every file download link target="_blank" so it opens in a dismissible
  // browser view instead of hijacking the standalone window.
  test('file download link opens in a new context (target=_blank), not the PWA window', async ({ page }) => {
    await register(page, `DownloadExit${Date.now()}`, uniqueEmail(), TEST_PASSWORD);
    await clickChannel(page, 'general');
    await page.waitForTimeout(500);

    // Attach an image → message renders an inline download anchor (data-testid="image-download").
    const attachButton = page.getByTestId('attach-file-button');
    await expect(attachButton).toBeVisible();
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      attachButton.click(),
    ]);
    await fileChooser.setFiles(TEST_PNG_PATH);
    await expect(page.getByTestId('file-preview')).toBeVisible({ timeout: 5000 });

    const uniqueText = `download exit test ${Date.now()}`;
    const editor = page.locator('.ql-editor');
    await editor.click();
    await page.keyboard.type(uniqueText, { delay: 10 });
    await page.keyboard.press('Enter');

    const messageRow = page.locator('.group.relative.flex.px-5').filter({ hasText: uniqueText }).first();
    await expect(messageRow).toBeVisible({ timeout: 10000 });

    // The download anchor must break out of the standalone window so the user can exit.
    const downloadLink = messageRow.getByTestId('image-download');
    await expect(downloadLink).toBeVisible({ timeout: 10000 });
    await expect(downloadLink).toHaveAttribute('target', '_blank');
    await expect(downloadLink).toHaveAttribute('rel', /noopener/);
    await expect(downloadLink).toHaveAttribute('download', /.+/);
  });
});
