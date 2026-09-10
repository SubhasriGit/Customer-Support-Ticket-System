---
name: 07-maintenance
description: Run CSTS pipeline Phase 7 — Maintenance. Final phase: creates a post-deployment JIRA story, updates the Operations Runbook in Confluence, and runs a health check against the live server. Triggers on: "run maintenance phase", "start phase 7", "post-deployment tasks", "run health check".
---

# Skill: Run Maintenance Phase

## When to Use
Use this skill to run CSTS pipeline Phase 7 — Maintenance. It is the final phase: creates a post-deployment JIRA story, updates the Operations Runbook in Confluence, and runs a health check against the live server.

## Trigger Phrases
- "run maintenance phase"
- "start phase 7"
- "post-deployment tasks"
- "create maintenance story"
- "update operations runbook"
- "run health check"

---

## Instructions

### Step 1 — Run the phase module
```bash
node workflow/phases/maintenance.js
```
Or invoke programmatically:
```js
const { run } = require('./workflow/phases/maintenance');
await run();
```

### Step 2 — Review output
```
[maintenance] Step 1/3 — Creating Maintenance story in JIRA...
[maintenance] ✅ JIRA story created: KAN-{N}

[maintenance] Step 2/3 — Publishing maintenance checklist to Confluence...
[maintenance] ✅ Confluence page updated: ID {id}

[maintenance] Step 3/3 — Running health check...
[maintenance] ✅ Health check: ok

[maintenance] MAINTENANCE PHASE COMPLETE
[maintenance]   JIRA story    : KAN-{N}
[maintenance]   Confluence    : Page ID {id}
[maintenance]   Health status : ok
[maintenance]   Local URL     : http://localhost:3000
[maintenance]   Production    : https://your-app.onrender.com
[maintenance] Pipeline fully complete. System is live and monitored.
```

### Step 3 — Pipeline complete
This is the final phase. No further approval is needed. The full 7-phase pipeline is done.

---

## JIRA Story Body
```json
{
  "fields": {
    "project": { "key": "KAN" },
    "issuetype": { "name": "Story" },
    "parent": { "key": "KAN-2" },
    "summary": "Maintenance & Post-Deployment Support",
    "priority": { "name": "Medium" },
    "labels": ["maintenance", "post-deployment"]
  }
}
```

---

## Confluence Runbook Sections
Upsert page titled `"Maintenance & Operations Runbook"` with these four sections:

1. **Health Check** — `GET /health` endpoint reference and expected response `{"status":"ok"}`
2. **Routine Tasks** — SLA breach monitoring (daily), ticket review (weekly), `npm audit fix` (monthly), API token rotation (every 90 days), SQLite backup (monthly), Cucumber coverage review (per sprint)
3. **Incident Response** — check `/health`, review server logs, rollback via `git revert HEAD` + redeploy
4. **Next Iteration Planning** — collect feedback, review analytics dashboard, prioritise JIRA backlog

---

## Health Check
The agent runs `curl -sf http://localhost:3000/health`.
- `ok` — server is running and healthy
- `unreachable` — server is not running (normal if pipeline ran without starting server)

If health check shows `unreachable`, start the server:
```bash
NODE_ENV=production node dist/server/server.js
# or for development:
node backend/server.js
```

---

## Routine Maintenance Schedule
| Task | Frequency |
|---|---|
| Monitor `GET /api/analytics` SLA breach rate | Daily |
| Review open tickets | Weekly |
| `cd backend && npm audit fix` | Monthly |
| Rotate JIRA/Confluence API tokens | Every 90 days |
| Backup `backend/*.sqlite` | Monthly |
| Review Cucumber test coverage for new features | Per sprint |

---

## HITL Checkpoint
This is the final phase — no further approval gate. After completion, state:
> "Pipeline fully complete. All 7 phases finished. System is live and monitored."

---

## Key Files
| File | Purpose |
|---|---|
| `workflow/phases/maintenance.js` | Phase runner — JIRA story + Confluence runbook + health check |

## Environment Variables Required
- `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`
- `CONFLUENCE_BASE_URL`, `CONFLUENCE_SPACE_KEY`
- `RENDER_URL` (optional — shown in summary if set)

## Common Issues
| Issue | Fix |
|---|---|
| JIRA story creation fails | `KAN-2` epic key may differ — check and update in `maintenance.js` |
| Confluence page not updated | Upsert GET may not find existing page — check space key |
| Health check `unreachable` | Expected if server isn't running — not a blocking failure |
