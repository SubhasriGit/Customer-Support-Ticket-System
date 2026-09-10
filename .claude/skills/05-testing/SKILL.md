---
name: 05-testing
description: Run CSTS pipeline Phase 5 — Testing. Starts the backend server, executes all Cucumber BDD scenarios, generates an HTML report, and reports pass/fail counts for HITL review. Triggers on: "run testing phase", "start phase 5", "run Cucumber tests", "run BDD tests", "execute test suite".
---

# Skill: Run Testing Phase

## When to Use
Use this skill to run CSTS pipeline Phase 5 — Testing. It starts the backend server (if not already running), executes all Cucumber BDD scenarios, generates an HTML report, and reports pass/fail counts for HITL review.

## Trigger Phrases
- "run testing phase"
- "start phase 5"
- "run Cucumber tests"
- "run BDD tests"
- "execute test suite"
- "generate test report"

---

## Instructions

### Step 1 — Run the phase module
```bash
node workflow/phases/qa.js
```
Or run Cucumber directly:
```bash
cd tests
npx cucumber-js --config cucumber.js
node cucumber-report/generate.js   # generate HTML report
```

### Step 2 — Review output
```
[qa] QA RESULTS (Cucumber BDD)
[qa]   Scenarios : 3 (3 passed, 0 failed)
[qa]   Steps     : 22 passed
[qa]   Healed    : 0 selector(s) auto-corrected
[qa]   Report    : tests/cucumber-report/html/index.html
[qa] ✅ All scenarios passed — ready for HITL sign-off
```

### Step 3 — Open HTML report
Open `tests/cucumber-report/html/index.html` in a browser to see full scenario results with screenshots on failure.

### Step 4 — HITL
Type `approve` to advance to Deployment. If scenarios failed, review the output and decide whether to approve anyway or reject with feedback.

---

## Feature File Pattern (Gherkin)
```gherkin
Feature: [Feature Name]
  As a [role]
  I want [action]
  So that [benefit]

  Background:
    Given I am on the support portal

  Scenario: [Scenario name]
    When I [action]
    Then I should [assertion]
```

---

## Step Definition Pattern
```js
// tests/steps/feature.steps.js
const { Given, When, Then } = require('@cucumber/cucumber');
const { expect } = require('@playwright/test');

// this.page is provided by World (tests/support/world.js)
When('I fill in the ticket title with {string}', async function (title) {
  await this.page.fill('[data-testid="ticket-title"]', title);
});

Then('I should see {string} in the ticket list', async function (text) {
  await expect(this.page.locator('[data-testid="ticket-list"]')).toContainText(text);
});
```

---

## World Class (CSTSWorld — tests/support/world.js)
The `CSTSWorld` class manages browser lifecycle:
- **Before**: launches `chromium` headless, creates context with `baseURL: process.env.BASE_URL || 'http://localhost:3000'`, opens a page → `this.page`
- **After**: on failure → attaches screenshot; always closes the browser

Use `this.page` in all step definitions — never create a new browser instance inside steps.

---

## Self-Healing Pattern
When a selector fails, use `resilientLocator`:
```js
async function resilientLocator(page, selector, hint = '') {
  try {
    await page.locator(selector).waitFor({ timeout: 5000 });
    return page.locator(selector);
  } catch {
    const { healSelector, applyHealedSelector, logHealingAction } =
      require('../../workflow/self-healing/playwright-healer');
    const result = await healSelector(selector, await page.content(), hint);
    if (result.healed) {
      applyHealedSelector(__filename, selector, result.replacement);
      logHealingAction({ file: __filename, ...result });
      return page.locator(result.replacement);
    }
    throw new Error(`Self-healing failed for: "${selector}"`);
  }
}
```
Healing tries: `data-testid` → `aria-label` → `text-content` → `role`.
Healed selectors are patched back into the test file and logged to `workflow/self-healing/healing-log.json`.

---

## Adding New Scenarios
1. Add a `Scenario:` block to `tests/features/tickets.feature`
2. If new steps are needed, add them to `tests/steps/tickets.steps.js`
3. Use `this.page` (provided by World) for all browser interactions
4. Use `[data-testid="..."]` selectors — fallback to `resilientLocator` for self-healing

---

## Test Coverage Matrix
| Story | Scenario to add |
|---|---|
| Ticket Triage | Category badge visible after submission |
| Priority Scoring | Priority badge shows correct colour |
| SLA Tracking | SLA countdown visible on open ticket |
| Analytics | Dashboard tab loads, KPI cards render |
| Auto-Response | Suggest Reply button opens suggestion panel |

---

## HITL Checkpoint
After test run, state:
> "HITL REVIEW REQUIRED — [N] scenarios passed, [N] failed. Report: tests/cucumber-report/html/index.html. Approve to proceed to Deployment."

---

## Key Files
| File | Purpose |
|---|---|
| `workflow/phases/qa.js` | Phase runner — starts server, runs Cucumber, parses results |
| `tests/cucumber.js` | Cucumber configuration |
| `tests/features/*.feature` | Gherkin feature files |
| `tests/steps/*.steps.js` | Step definitions (use `this.page` from World) |
| `tests/support/world.js` | `CSTSWorld` — browser lifecycle (Before/After hooks) |
| `tests/cucumber-report/generate.js` | HTML report generator |

## Environment Variables Required
- `BASE_URL` (optional, defaults to `http://localhost:3000`)

## Common Issues
| Issue | Fix |
|---|---|
| `Cannot find module '@cucumber/cucumber'` | `cd tests && npm install` |
| Server not ready within 30s | Check `backend/server.js` starts cleanly; verify `.env` has valid `PORT` |
| Scenario fails: element not found | Check `data-testid` attribute exists in the React component |
| HTML report missing | Run `node cucumber-report/generate.js` separately after test run |
