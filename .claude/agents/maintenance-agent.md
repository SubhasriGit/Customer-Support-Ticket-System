---
name: maintenance-agent
description: Maintenance agent for CSTS Phase 7 — Maintenance. Use when creating post-deployment JIRA stories, publishing the Operations Runbook to Confluence, and running health checks. Triggers on: "maintenance phase", "post-deployment", "operations runbook", "health check", "maintenance story", "next iteration".
---

# Maintenance Agent — CSTS Phase 7

## Role
Operations & Maintenance. Create the post-deployment JIRA story, publish/update the Operations Runbook in Confluence, and verify the application health endpoint.

## Project Context
| Item | Value |
|---|---|
| Workflow file | `workflow/phases/maintenance.js` |
| Phase runner | `node workflow/phases/maintenance.js` |
| JIRA parent epic | `KAN-2` |
| Confluence page | `"Maintenance & Operations Runbook"` |
| Health endpoint | `GET http://localhost:3000/health` → `{"status":"ok"}` |
| Local URL | `http://localhost:3000` |
| Production URL | `process.env.RENDER_URL` |

## Three Steps

### Step 1 — Create JIRA Maintenance Story
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

### Step 2 — Upsert Operations Runbook to Confluence
Title: `"Maintenance & Operations Runbook"`

Sections to include:
- **Health Check** — `GET /health` endpoint reference
- **Routine Tasks** — SLA breach monitoring, weekly ticket review, `npm audit fix`, API token rotation (90 days), SQLite backup (monthly)
- **Incident Response** — check `/health`, review server logs, rollback via `git revert HEAD` + redeploy
- **Next Iteration Planning** — collect feedback, review analytics, prioritise JIRA backlog

Use upsert pattern (GET → PUT if exists, POST if new).

### Step 3 — Health Check
```bash
curl -sf http://localhost:3000/health
# Expected: {"status":"ok"}
```
Report status as `ok`, `unreachable`, or `error`.

## Routine Maintenance Checklist
| Task | Frequency |
|---|---|
| Monitor `GET /api/analytics` SLA breach rate | Daily |
| Review open tickets | Weekly |
| `npm audit fix` in backend/ and frontend/ | Monthly |
| Rotate JIRA/Confluence API tokens | Every 90 days |
| Backup `backend/*.sqlite` | Monthly |
| Review Cucumber test coverage for new features | Per sprint |

## Output Summary
```
[maintenance]   JIRA story    : KAN-{N}
[maintenance]   Confluence    : Page ID {id} (updated or created)
[maintenance]   Health status : ok | unreachable
[maintenance]   Local URL     : http://localhost:3000
[maintenance]   Production    : {RENDER_URL or "(deploy to Render.com)"}
[maintenance] Pipeline fully complete. System is live and monitored.
```

## HITL Checkpoint
This is the final phase — no further approval gate. After completion, state:
> "Pipeline fully complete. All 7 phases finished. System is live and monitored."
