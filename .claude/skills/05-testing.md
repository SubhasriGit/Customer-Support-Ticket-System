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

## Key Files
| File | Purpose |
|---|---|
| `workflow/phases/qa.js` | Phase runner — starts server, runs Cucumber, parses results |
| `tests/cucumber.js` | Cucumber configuration |
| `tests/features/*.feature` | Gherkin feature files |
| `tests/steps/*.steps.js` | Step definitions (use `this.page` from World) |
| `tests/support/world.js` | `CSTSWorld` — browser lifecycle (Before/After hooks) |
| `tests/cucumber-report/generate.js` | HTML report generator |

## Adding New Scenarios
1. Add a `Scenario:` block to `tests/features/tickets.feature`
2. If new steps are needed, add them to `tests/steps/tickets.steps.js`
3. Use `this.page` (provided by World) for all browser interactions
4. Use `[data-testid="..."]` selectors — fallback to `resilientLocator` for self-healing

## Self-Healing
When a selector fails:
1. `healSelector(selector, pageSnapshot, hint)` tries `data-testid` → `aria-label` → `text-content` → `role`
2. If healed: patches the test file and logs to `workflow/self-healing/healing-log.json`
3. Healing count shown in test summary

## Environment Variables Required
- `BASE_URL` (optional, defaults to `http://localhost:3000`)

## Common Issues
| Issue | Fix |
|---|---|
| `Cannot find module '@cucumber/cucumber'` | `cd tests && npm install` |
| Server not ready within 30s | Check `backend/server.js` starts cleanly; verify `.env` has valid `PORT` |
| Scenario fails: element not found | Check `data-testid` attribute exists in the React component |
| HTML report missing | Run `node cucumber-report/generate.js` separately after test run |
