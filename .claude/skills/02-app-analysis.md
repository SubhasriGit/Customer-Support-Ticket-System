# Skill: Run App Analysis & Enhancement Phase

## When to Use
Use this skill to run CSTS pipeline Phase 2 — App Analysis. It fetches the JIRA user stories created in Phase 1, evaluates each against enterprise support system standards, closes gaps by updating or creating stories in JIRA, and publishes a Gap Analysis report to Confluence.

**This phase does not read or modify any application source code.**

## Trigger Phrases
- "run app analysis"
- "start phase 2"
- "review user stories for gaps"
- "enhance JIRA stories"
- "find missing acceptance criteria"
- "gap analysis on stories"

---

## Instructions

### Step 1 — Ensure Phase 1 has run
Phase 2 depends on JIRA stories being present from Phase 1. Verify:
```bash
# Check stories exist in JIRA project KAN
# If Phase 1 hasn't run yet, start from the beginning:
node workflow/orchestrator.js requirement_analysis
```

### Step 2 — Run the phase module
```bash
node workflow/phases/app_analysis.js
```
Or invoke programmatically:
```js
const { run } = require('./workflow/phases/app_analysis');
await run({ feedback: 'optional feedback string' });
```

### Step 3 — Understand what gets evaluated

The agent fetches all Stories from JIRA project `KAN` and checks each against six criteria:

| Criterion | What it checks |
|---|---|
| Acceptance criteria completeness | ≥ 3 measurable criteria in the story description |
| Edge cases covered | At least one failure/empty/error scenario documented |
| Non-functional requirements | SLA target or performance note present where relevant |
| Integration points | API endpoints or DB tables named in the story |
| Story independence | Story is self-contained — no hidden dependency on another story |
| Testability | Every criterion is verifiable from the UI or API without reading source code |

### Step 4 — Review gap output
```
APP ANALYSIS COMPLETE
  Stories reviewed   : 5
  Gaps found         : 8
    - Missing acceptance criteria : 3 stories updated
    - Missing edge cases          : 2 subtasks created
    - Missing feature areas       : 1 new story created
    - Vague subtasks              : 2 subtasks updated

  JIRA changes       : 5 updates, 3 new issues (keys: KAN-109, KAN-110, KAN-111)
  Report             : https://subhasree.atlassian.net/wiki/...
```

### Step 5 — Review Confluence report
Open the Gap Report URL. Verify:
- Every gap has a clear rationale (which criterion failed)
- New stories make sense for the project scope
- Updated stories now have complete acceptance criteria

### Step 6 — HITL
Type `approve` to advance to Design, or provide feedback such as:
```
reject The new story for email notifications is out of scope for this sprint
```
The phase re-runs incorporating your feedback.

---

## Key Files
| File | Purpose |
|---|---|
| `workflow/phases/app_analysis.js` | Phase runner — JIRA story review + gap closing + Confluence report |

## JIRA Actions Taken Per Gap Type
| Gap type | JIRA action |
|---|---|
| Missing acceptance criteria | PUT existing story — update description |
| Missing edge case | POST new Subtask under existing story |
| Missing feature area | POST new Story under the epic |
| Vague subtask | PUT existing Subtask — update description |

## Environment Variables Required
- `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`
- `CONFLUENCE_BASE_URL`, `CONFLUENCE_SPACE_KEY`

## Common Issues
| Issue | Fix |
|---|---|
| "No stories found" | Phase 1 hasn't run — run `node workflow/orchestrator.js requirement_analysis` first |
| JIRA PUT 400 on story update | Story description may be in a format the API rejects — check the ADoc structure in `app_analysis.js` |
| Confluence 400 on create | Upsert pattern auto-handles duplicate titles — check `CONFLUENCE_SPACE_KEY` is correct |
| Phase creates too many new stories | Provide feedback to scope it: "reject Limit new stories to must-have features only" |

## What This Phase Does NOT Do
- Does not read `backend/`, `frontend/`, or `tests/` directories
- Does not run any build or test commands
- Does not modify any file on disk
- Does not change story priorities or sprint assignments
