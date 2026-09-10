const { Given, When, Then } = require('@cucumber/cucumber');
const { expect } = require('@playwright/test');
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

Given('I am on the support portal', async function () {
  await this.page.goto('/');
});

When('I fill in the ticket title with {string}', async function (title) {
  await (await resilientLocator(this.page, '[data-testid="ticket-title"]', 'title')).fill(title);
});

When('I fill in the ticket email with {string}', async function (email) {
  await (await resilientLocator(this.page, '[data-testid="ticket-email"]', 'email')).fill(email);
});

When('I fill in the ticket description with {string}', async function (description) {
  await (await resilientLocator(this.page, '[data-testid="ticket-description"]', 'description')).fill(description);
});

When('I submit the ticket', async function () {
  await (await resilientLocator(this.page, '[data-testid="ticket-submit"]', 'submit')).click();
});

When('I close the ticket {string}', async function (ticketTitle) {
  const ticket = this.page.locator('[data-testid^="ticket-card-"]').filter({ hasText: ticketTitle });
  await expect(ticket.first()).toBeVisible({ timeout: 10000 });
  await Promise.all([
    this.page.waitForResponse(
      res => res.url().includes('/api/tickets') && res.status() === 200,
      { timeout: 10000 }
    ),
    ticket.first().locator('[data-testid^="toggle-status-"]').click(),
  ]);
});

When('I filter tickets by {string} status', async function (status) {
  await (await resilientLocator(this.page, `[data-testid="filter-${status}"]`, `${status} filter`)).click();
});

Then('I should see {string} in the ticket list', async function (text) {
  const list = await resilientLocator(this.page, '[data-testid="ticket-list"]', 'list');
  await expect(list).toContainText(text, { timeout: 10000 });
});

Then('the ticket {string} should show status {string}', async function (ticketTitle, status) {
  const ticket = this.page.locator('[data-testid^="ticket-card-"]').filter({ hasText: ticketTitle });
  await expect(ticket.first().locator('[data-testid^="ticket-status-"]')).toContainText(status, { timeout: 10000 });
});

Then('I should see no open tickets', async function () {
  const openTickets = this.page.locator('[data-testid^="ticket-status-"]').filter({ hasText: 'open' });
  await expect(openTickets).toHaveCount(0, { timeout: 5000 });
});
