# Skill: Run Design Phase

## When to Use
Use this skill to run CSTS pipeline Phase 3 — Design. It produces four Confluence artifacts: Architecture Document, High Level Design, Low Level Design, and Wireframes.

## Trigger Phrases
- "run design phase"
- "start phase 3"
- "generate architecture documents"
- "publish design to Confluence"
- "create HLD and LLD"

---

## Instructions

### Step 1 — Run the phase module
```bash
node workflow/phases/design.js
```
Or invoke programmatically:
```js
const { run } = require('./workflow/phases/design');
await run({ feedback: 'optional feedback string' });
```

### Step 2 — Review Confluence output
The agent upserts four pages and prints each URL:
```
[design] Updated: "CSTS — Architecture Document (YYYY-MM-DD)" (vN) → https://...
[design] Updated: "CSTS — High Level Design (YYYY-MM-DD)" (vN) → https://...
[design] Updated: "CSTS — Low Level Design (YYYY-MM-DD)" (vN) → https://...
[design] Updated: "CSTS — Wireframes (YYYY-MM-DD)" (vN) → https://...
[design] All 4 artifacts published to Confluence.
```

### Step 3 — Review each document
Open each Confluence link and verify:
- Architecture: system layers match current stack
- HLD: data flow covers all sprint features
- LLD: API signatures match `backend/routes/*.js` + DB schema matches migrations
- Wireframes: UI element labels match `data-testid` values in tests

### Step 4 — HITL
Type `approve` to advance to Development, or provide feedback (e.g. "update LLD to include analytics endpoint") to re-run with changes.

---

## Key Files
| File | Purpose |
|---|---|
| `workflow/phases/design.js` | Phase runner — generates and publishes all 4 artifacts |

## Page Title Pattern
All four pages use today's date: `CSTS — {Type} (YYYY-MM-DD)`.
On repeated runs the pages are **updated** (PUT with version+1), never duplicated.

## Environment Variables Required
- `JIRA_EMAIL`, `JIRA_API_TOKEN` (used for Confluence auth)
- `CONFLUENCE_BASE_URL`, `CONFLUENCE_SPACE_KEY`

## Common Issues
| Issue | Fix |
|---|---|
| Confluence 400 on update | Version mismatch — the upsert GET fetches current version automatically |
| Wrong date in page title | System clock — pages are titled with today's date at run time |
| Missing pages | Check `CONFLUENCE_SPACE_KEY` is correct and the account has create permission |
