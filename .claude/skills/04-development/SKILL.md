---
name: 04-development
description: Run CSTS pipeline Phase 4 — Development. Creates a feature branch, generates code stubs via CodeMie, commits, and opens a GitHub PR for HITL review. Triggers on: "run development phase", "start phase 4", "generate feature code", "implement sprint stories", "create feature branch and PR".
---

# Skill: Run Development Phase

## When to Use
Use this skill to run CSTS pipeline Phase 4 — Development. It creates a feature branch, generates code stubs via CodeMie, commits, and opens a GitHub PR for HITL review.

## Trigger Phrases
- "run development phase"
- "start phase 4"
- "generate feature code"
- "implement sprint stories"
- "create feature branch and PR"

---

## Instructions

### Step 1 — Run the phase module
```bash
node workflow/phases/development.js
```
Or invoke programmatically:
```js
const { run } = require('./workflow/phases/development');
await run({ feedback: 'optional feedback string' });
```

### Step 2 — Review branch and PR
The agent prints:
```
[development] Created branch: feature/ai-enhancements-{timestamp}
[development] Code generated. Staging and committing...
[HITL] PR created: https://github.com/SubhasriGit/Customer-Support-Ticket-System/pull/{N}
```

### Step 3 — Approve the PR (two options)
**Option A — type in chat:**
```
approve
```
**Option B — approve on GitHub:**
Go to the PR URL → Files changed → Review changes → Approve → Submit review.

Either action unblocks the pipeline and advances to Testing.

### Step 4 — Request changes
To send feedback instead of approving:
```
reject The triage route is missing error handling
```
The pipeline re-runs development with your feedback string.

---

## Hard Constraints
- Use `node:sqlite` (built-in, Node 22+) — NEVER `better-sqlite3` or `sqlite3` packages
- No hardcoded secrets — all credentials via `process.env`
- All env vars read from `.env` (gitignored)
- Pre-commit hook blocks secrets — NEVER use `--no-verify`

---

## Code Patterns

### Backend Route (`backend/routes/feature.js`)
```js
const express = require('express');
const router = express.Router();
router.get('/', (req, res) => {
  try {
    const db = require('../db/database').getDb();
    const rows = db.prepare('SELECT * FROM table').all();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;
```

### SQLite Migration (`backend/db/migrations/00N_feature.sql`)
```sql
ALTER TABLE tickets ADD COLUMN field_name TEXT DEFAULT 'value';
```

### React Component (`frontend/src/components/Feature.jsx`)
```jsx
import React, { useState, useEffect } from 'react';
export default function Feature() {
  const [data, setData] = useState([]);
  useEffect(() => {
    fetch('/api/feature').then(r => r.json()).then(setData);
  }, []);
  return <div data-testid="feature-root">{/* render */}</div>;
}
```

---

## data-testid Convention
| Element | testid |
|---|---|
| Submit form | `ticket-form` |
| Title input | `ticket-title` |
| Email input | `ticket-email` |
| Submit button | `ticket-submit` |
| Ticket list item | `ticket-{id}` |
| Status badge | `ticket-status-{id}` |
| Toggle status | `toggle-status-{id}` |
| Filter All | `filter-all` |
| Filter Open | `filter-open` |
| Filter Closed | `filter-closed` |
| New features | `{feature}-{element}` pattern |

---

## Git Workflow
1. `git checkout -b feature/ai-enhancements-{Date.now()}`
2. Implement changes from LLD
3. `git add {specific files}` (never `git add .` — secrets risk)
4. `git commit -m "feat: {description}"`
5. `git push -u origin {branch}`
6. `gh pr create --title "..." --body "..."`

---

## Expected Generated Files Per Sprint
| Sprint | Files |
|---|---|
| Sprint 1 | `backend/routes/triage.js`, `frontend/src/components/TicketCard.jsx` update, `backend/db/migrations/002_sprint1_triage.sql` |
| Sprint 2 | `backend/services/slaService.js`, `backend/db/migrations/003_sprint2_sla.sql` |
| Sprint 3 | `backend/routes/analytics.js`, `frontend/src/components/Dashboard.jsx`, `backend/routes/suggestions.js`, `frontend/src/components/SuggestedReply.jsx`, `backend/db/migrations/004_sprint3_responses.sql` |

---

## HITL Checkpoint
After PR is opened, state:
> "HITL REVIEW REQUIRED — PR #{number} opened: {url}. Review code changes and approve on GitHub or type 'approve' here to proceed to Testing."

The PR gate accepts both:
- GitHub PR approval (review → Approve on GitHub)
- Stdin `approve` / `reject [feedback]` typed in chat

---

## Key Files
| File | Purpose |
|---|---|
| `workflow/phases/development.js` | Phase runner — branch, codegen, commit, PR |
| `workflow/hitl/reviewer.js` | PR creation and approval polling (GitHub + stdin) |

## Branch Naming
`feature/ai-enhancements-{Date.now()}` — unique per run, prevents branch conflicts.

## Environment Variables Required
- `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_PAT`

## Common Issues
| Issue | Fix |
|---|---|
| PR creation fails | Check `GITHUB_PAT` has `repo` scope |
| Branch already exists | Previous run left branch — delete it: `git branch -D feature/...` |
| Pre-commit hook blocks | Fix the secret/lint issue the hook reports — never use `--no-verify` |
