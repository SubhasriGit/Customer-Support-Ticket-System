const { test, expect } = require('@playwright/test');
const { healSelector, applyHealedSelector, logHealingAction } = require('../../workflow/self-healing/playwright-healer');
const path = require('path');
const THIS_FILE = __filename;

async function resilientLocator(page, selector, hint = '') {
  try {
    await page.locator(selector).waitFor({ timeout: 5000 });
    return page.locator(selector);
  } catch {
    console.warn(`[playwright] Selector failed: "${selector}". Attempting self-heal...`);
    const snapshot = await page.content();
    const result = await healSelector(selector, snapshot, hint);

    if (result.healed) {
      applyHealedSelector(THIS_FILE, selector, result.replacement);
      logHealingAction({ file: path.basename(THIS_FILE), ...result });
      return page.locator(result.replacement);
    }
    throw new Error(`Self-healing failed for selector: "${selector}"`);
  }
}

test.describe('Ticket Submission', () => {
  test('should submit a new ticket successfully', async ({ page }) => {
    await page.goto('/');

    const form = await resilientLocator(page, '[data-testid="ticket-form"]', 'form');
    await expect(form).toBeVisible();

    await (await resilientLocator(page, '[data-testid="ticket-title"]', 'title')).fill('Login page broken');
    await (await resilientLocator(page, '[data-testid="ticket-email"]', 'email')).fill('user@example.com');
    await (await resilientLocator(page, '[data-testid="ticket-description"]', 'description')).fill('Cannot log in after password reset.');
    await (await resilientLocator(page, '[data-testid="ticket-submit"]', 'submit')).click();

    const list = await resilientLocator(page, '[data-testid="ticket-list"]', 'list');
    await expect(list).toContainText('Login page broken');
  });
});

test.describe('Ticket Status', () => {
  test('should toggle ticket status between open and closed', async ({ page }) => {
    await page.goto('/');

    await (await resilientLocator(page, '[data-testid="ticket-title"]', 'title')).fill('Status test ticket');
    await (await resilientLocator(page, '[data-testid="ticket-email"]', 'email')).fill('qa@example.com');
    await (await resilientLocator(page, '[data-testid="ticket-description"]', 'description')).fill('Testing status toggle.');
    await (await resilientLocator(page, '[data-testid="ticket-submit"]', 'submit')).click();

    const tickets = page.locator('[data-testid^="ticket-card-"]').filter({ hasText: 'Status test ticket' });
    await expect(tickets.first()).toBeVisible();

    const toggleBtn = tickets.first().locator('[data-testid^="toggle-status-"]');
    await toggleBtn.click();

    const statusBadge = tickets.first().locator('[data-testid^="ticket-status-"]');
    await expect(statusBadge).toContainText('closed');
  });
});

test.describe('Ticket Filtering', () => {
  test('should filter tickets by status', async ({ page }) => {
    await page.goto('/');

    const closedFilter = await resilientLocator(page, '[data-testid="filter-closed"]', 'closed filter');
    await closedFilter.click();

    const openTickets = page.locator('[data-testid^="ticket-status-"]').filter({ hasText: 'open' });
    await expect(openTickets).toHaveCount(0);
  });
});
