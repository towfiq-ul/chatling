import { expect, test } from '@playwright/test';

const REACT_APP_URL = 'http://localhost:5173';

// Proves the "mount outside the router's swapped subtree" guidance actually
// works for this package (PRD §4.2), not just that it compiles: open the
// chat, navigate to a different page via the app's hash router, and confirm
// the widget is still open with the same messages.
test('widget survives a route change in the React example', async ({ page }) => {
  await page.goto(`${REACT_APP_URL}/#home`);
  await page.waitForLoadState('networkidle');

  await page.locator('.bubble').click();
  await page.locator('.input').fill('Does this survive navigation?');
  await page.locator('.sendButton').click();
  await expect(page.locator('.message.messageAssistant').last()).toBeVisible({ timeout: 5000 });

  await expect(page.locator('.panel[role="dialog"]')).toBeVisible();

  await page.getByRole('link', { name: 'Go to About →' }).click();
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();

  await expect(page.locator('.panel[role="dialog"]')).toBeVisible();
  await expect(page.locator('.message.messageUser').last()).toHaveText(
    'Does this survive navigation?',
  );
});
