import { expect, test } from '@playwright/test';

const PAGE_URL = '/examples/vanilla/index.html';

test.beforeEach(async ({ page }) => {
  await page.goto(PAGE_URL);
  await page.waitForLoadState('networkidle');
});

test.describe('bubble click vs. drag', () => {
  test('clicking the bubble with no movement opens the panel', async ({ page }) => {
    const bubble = page.locator('.bubble');
    await expect(bubble).toBeVisible();

    await bubble.click();

    await expect(page.locator('.panel[role="dialog"]')).toBeVisible();
    await expect(bubble).toHaveAttribute('aria-expanded', 'true');
  });

  test('dragging the bubble past the threshold repositions it without opening', async ({
    page,
  }) => {
    const bubble = page.locator('.bubble');
    const before = await bubble.boundingBox();
    if (!before) throw new Error('bubble not visible');

    const startX = before.x + before.width / 2;
    const startY = before.y + before.height / 2;

    // Default position is the right edge, so drag toward the center/left —
    // dragging further right would immediately hit the viewport clamp and
    // barely move, which is a property of the test, not of the widget.
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX - 150, startY + 40, { steps: 8 });
    await page.mouse.up();

    await expect(page.locator('.panel[role="dialog"]')).toBeHidden();

    const after = await bubble.boundingBox();
    if (!after) throw new Error('bubble not visible after drag');
    expect(Math.abs(after.x - before.x)).toBeGreaterThan(10);
  });
});

test.describe('sending a message', () => {
  test('shows the typing indicator, then a grounded assistant reply', async ({ page }) => {
    await page.locator('.bubble').click();

    const input = page.locator('.input');
    await input.fill('What services do you offer?');
    await page.locator('.sendButton').click();

    await expect(page.locator('.message.messageUser').last()).toHaveText(
      'What services do you offer?',
    );
    await expect(
      page.locator('.typingIndicator[aria-label="Assistant is thinking"]'),
    ).toBeVisible();

    const assistantMessage = page.locator('.message.messageAssistant').last();
    await expect(assistantMessage).toBeVisible({ timeout: 5000 });
    await expect(assistantMessage).toContainText('Services section');
    await expect(page.locator('.typingIndicator')).toBeHidden();
  });
});

test.describe('expand/collapse', () => {
  test('toggling full-screen does not navigate and preserves message content', async ({ page }) => {
    await page.locator('.bubble').click();
    const input = page.locator('.input');
    await input.fill('Hello there');
    await page.locator('.sendButton').click();
    await expect(page.locator('.message.messageAssistant').last()).toBeVisible({ timeout: 5000 });

    const messagesBefore = await page.locator('.messages').innerText();

    let navigations = 0;
    page.on('framenavigated', () => {
      navigations += 1;
    });

    const expandButton = page.locator('.iconButton[aria-label="Expand"]');
    await expandButton.click();
    await expect(page.locator('.bubble')).toBeHidden();

    const collapseButton = page.locator('.iconButton[aria-label="Collapse"]');
    await collapseButton.click();
    await expect(page.locator('.bubble')).toBeVisible();

    expect(navigations).toBe(0);
    const messagesAfter = await page.locator('.messages').innerText();
    expect(messagesAfter).toBe(messagesBefore);
  });
});

test.describe('greeting popup', () => {
  test('appears once after the delay, then respects the cooldown across reloads', async ({
    page,
  }) => {
    const greeting = page.locator('.greeting');
    await expect(greeting).toBeVisible({ timeout: 1500 });
    await expect(greeting.locator('.greetingText')).toHaveText('Hi! 👋 Ask me anything.');

    const greetedAt = await page.evaluate(() =>
      window.localStorage.getItem('ai-chat-widget:greeted-at'),
    );
    expect(greetedAt).toBeTruthy();

    await page.locator('.greetingClose').click();
    await expect(greeting).toBeHidden();

    // Reload well within the 5s test cooldown — the greeting must not
    // reappear yet (this is the ordering bug PRD §4.11 calls out: the
    // timestamp is written at show-time, not dismiss-time).
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(800);
    await expect(page.locator('.greeting')).toBeHidden();

    // Wait out the rest of the cooldown window, then reload again.
    await page.waitForTimeout(4500);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('.greeting')).toBeVisible({ timeout: 1500 });
  });
});

test.describe('persistence across a reload', () => {
  test('messages and bubble position survive a page reload', async ({ page }) => {
    await page.locator('.bubble').click();
    await page.locator('.input').fill('Remember this message');
    await page.locator('.sendButton').click();
    await expect(page.locator('.message.messageAssistant').last()).toBeVisible({ timeout: 5000 });

    const bubble = page.locator('.bubble');
    const before = await bubble.boundingBox();
    if (!before) throw new Error('bubble not visible');
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
    await page.mouse.down();
    await page.mouse.move(before.x - 120, before.y + 60, { steps: 8 });
    await page.mouse.up();
    const draggedPosition = await bubble.boundingBox();
    if (!draggedPosition) throw new Error('bubble not visible after drag');

    await page.reload();
    await page.waitForLoadState('networkidle');

    const restoredPosition = await page.locator('.bubble').boundingBox();
    if (!restoredPosition) throw new Error('bubble not visible after reload');
    expect(Math.round(restoredPosition.x)).toBeCloseTo(Math.round(draggedPosition.x), 0);

    await page.locator('.bubble').click();
    await expect(page.locator('.message.messageUser').last()).toHaveText('Remember this message');
  });
});
