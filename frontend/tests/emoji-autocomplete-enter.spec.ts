import { test, expect } from '@playwright/test';
import { register, uniqueEmail, clickChannel, waitForChannelReady, TEST_PASSWORD } from './helpers';

test.describe('Emoji autocomplete', () => {
  // Regression test: selecting an emoji from the autocomplete with Enter used to leave a
  // stray trailing character (e.g. "...handoff🙏a"). insertEmojiFromAutocomplete computed
  // deleteLength from the emojiQuery state, which lags behind the typed text when React
  // batches updates during fast typing. Fixed by deriving the span to delete from the live
  // Quill cursor position instead (mirrors the @mention fix in #166).
  //
  // The bug is a sub-task React state-batching race that Playwright's inter-keystroke delay
  // lets resolve, so we reproduce it deterministically: type ":jo" (committing emojiQuery
  // = "jo"), then within a single browser task insert the final "y" and dispatch Enter
  // before React can re-render. On the buggy code the stale closure deletes only ":jo",
  // leaving "y" after the emoji; the fix reads the live cursor and deletes ":joy".
  test('selecting an emoji via Enter leaves no stray query characters', async ({ page }) => {
    const ts = Date.now();
    await register(page, `EmojiEnter${ts}`, uniqueEmail(), TEST_PASSWORD);

    await clickChannel(page, 'general');
    await waitForChannelReady(page);

    const editor = page.locator('.ql-editor');
    await editor.click();

    // Type some text then a partial :shortcode. Wait for the autocomplete so the emojiQuery
    // state ("jo") and emojiStartIndex are committed in React.
    await page.keyboard.type('handoff ', { delay: 20 });
    await page.keyboard.type(':jo', { delay: 20 });
    await expect(page.getByTestId('emoji-autocomplete')).toBeVisible({ timeout: 5000 });

    // In a single JS task: append the final query char (schedules setEmojiQuery('joy') but
    // does not flush it) then synchronously fire Enter. The keyboard handler runs against the
    // not-yet-updated closure — exactly the race a fast typist hits.
    await page.evaluate(() => {
      const q = (window as any).__quill;
      q.focus();
      const sel = q.getSelection(true);
      const at = sel ? sel.index : q.getLength() - 1;
      q.insertText(at, 'y', 'user');
      q.setSelection(at + 1);
      q.root.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        }),
      );
    });

    // The autocomplete closes and the editor holds exactly the text plus the emoji — no
    // leftover ':' or shortcode fragment trailing the emoji.
    await expect(page.getByTestId('emoji-autocomplete')).not.toBeVisible();
    const editorText = (await editor.textContent()) ?? '';
    expect(editorText).toContain('😂');
    expect(editorText).not.toContain(':');
    expect(editorText).not.toContain('joy');
    expect(editorText.trim()).toBe('handoff 😂');
  });
});
