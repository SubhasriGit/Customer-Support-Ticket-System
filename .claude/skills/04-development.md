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

## Key Files
| File | Purpose |
|---|---|
| `workflow/phases/development.js` | Phase runner — branch, codegen, commit, PR |
| `workflow/hitl/reviewer.js` | PR creation and approval polling (GitHub + stdin) |

## Branch Naming
`feature/ai-enhancements-{Date.now()}` — unique per run, prevents branch conflicts.

## Code Generation
The current phase stub calls `Claude Code CLI via CodeMie`. Actual generated files depend on the LLD from the Design phase. Expected outputs per sprint:
- Sprint 1: `backend/routes/triage.js`, `frontend/src/components/TicketCard.jsx` update, migration `002_sprint1_triage.sql`
- Sprint 2: `backend/services/slaService.js`, migration `003_sprint2_sla.sql`
- Sprint 3: `backend/routes/analytics.js`, `frontend/src/components/Dashboard.jsx`, `backend/routes/suggestions.js`, `frontend/src/components/SuggestedReply.jsx`, migration `004_sprint3_responses.sql`

## Environment Variables Required
- `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_PAT`

## Common Issues
| Issue | Fix |
|---|---|
| PR creation fails | Check `GITHUB_PAT` has `repo` scope |
| Branch already exists | Previous run left branch — delete it: `git branch -D feature/...` |
| Pre-commit hook blocks | Fix the secret/lint issue the hook reports — never use `--no-verify` |
