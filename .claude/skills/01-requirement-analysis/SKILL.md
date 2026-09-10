---
name: 01-requirement-analysis
description: Run CSTS pipeline Phase 1 — Requirement Analysis. Parses requirements/requirements.txt, creates JIRA Epic/Story/Subtask hierarchy, and generates a 3-sprint plan. Triggers on: "run requirement analysis", "start phase 1", "parse requirements and create JIRA", "run BA analysis".
---

# Skill: Run Requirement Analysis Phase

## When to Use
Use this skill to run CSTS pipeline Phase 1 — Requirement Analysis. It parses `requirements/requirements.txt`, creates the full JIRA Epic → Story → Subtask hierarchy, and generates a 3-sprint plan.

## Trigger Phrases
- "run requirement analysis"
- "start phase 1"
- "parse requirements and create JIRA"
- "run BA analysis"

---

## Instructions

### Step 1 — Read the requirements file
Read `requirements/requirements.txt`. Parse blocks using the line-based format:
```
EPIC: ...       → create JIRA Epic
STORY: ...      → create Story under last Epic
TASK: ...       → create Subtask under last Story
Description:    → attach to the preceding Epic or Story
```

### Step 2 — Run the phase module
```bash
node workflow/phases/requirement_analysis.js
```
Or invoke programmatically:
```js
const { run } = require('./workflow/phases/requirement_analysis');
await run({ feedback: 'optional feedback string' });
```

### Step 3 — Review HITL output
The phase prints a summary:
```
[requirement_analysis] REQUIREMENT ANALYSIS COMPLETE
  JIRA epics, stories, subtasks created
  Sprint plan and estimates applied
HITL REVIEW REQUIRED — Approve to proceed to Design.
```
Type `approve` to advance the pipeline, or provide feedback to re-run with changes.

### Step 4 — Start pipeline from this phase
To run the full pipeline starting from this phase:
```bash
node workflow/orchestrator.js requirement_analysis
```

---

## JIRA Hierarchy

```
Epic
  └─ Story (5 per epic typical)
       └─ Subtask (3–5 per story)
```

### JIRA API Request Bodies

**Create Epic**
```json
{
  "fields": {
    "project": { "key": "KAN" },
    "issuetype": { "name": "Epic" },
    "summary": "<Epic title>",
    "description": { "type": "doc", "version": 1, "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "<description>" }] }] }
  }
}
```

**Create Story** (parent = Epic key)
```json
{
  "fields": {
    "project": { "key": "KAN" },
    "issuetype": { "name": "Story" },
    "summary": "<Story title>",
    "parent": { "key": "<EPIC_KEY>" },
    "description": { "type": "doc", "version": 1, "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "<description>" }] }] }
  }
}
```

**Create Subtask** (parent = Story key)
```json
{
  "fields": {
    "project": { "key": "KAN" },
    "issuetype": { "name": "Subtask" },
    "summary": "<Task title>",
    "parent": { "key": "<STORY_KEY>" }
  }
}
```

Auth: `Authorization: Basic base64(JIRA_EMAIL:JIRA_API_TOKEN)`
Endpoint: `POST {JIRA_BASE_URL}/rest/api/3/issue`

---

## Sprint Plan Format

Assign stories to 3 sprints (2 weeks each), themed:
- Sprint 1 — Foundation (core ticket management, data model)
- Sprint 2 — Monitoring & Tracking (SLA, status, notifications)
- Sprint 3 — Intelligence & AI (auto-triage, analytics, suggestions)

```
Sprint N — [Theme] (2 weeks)
  Stories: [KAN-X, KAN-Y]
  Points:  N pts
  Priority: [High|Medium|Low]
```

### Story Point Guidelines
| Complexity | Points |
|---|---|
| Trivial config or copy change | 1 |
| Simple CRUD endpoint | 2 |
| Standard feature (route + UI + migration) | 3 |
| Complex feature with AI or analytics | 5 |
| Large cross-cutting feature | 8 |

---

## Error Handling
- Missing env vars → list each missing var, halt with a clear message
- JIRA 400/401 → log the full response body, skip the issue, continue with the next
- Partial creation → log all successfully created keys, resume from the last successful item

---

## HITL Checkpoint
After parsing, present the full hierarchy for review. State:
> "HITL REVIEW REQUIRED — [N] stories, [N] subtasks ready. Approve to create in JIRA."

After JIRA creation, present the sprint plan for review before finalising story assignments.

---

## Key Files
| File | Purpose |
|---|---|
| `requirements/requirements.txt` | Source of truth for all requirements |
| `workflow/phases/requirement_analysis.js` | Phase runner |
| `workflow/phases/analysis.js` | BA sub-agent (JIRA hierarchy creation) |
| `workflow/phases/plan.js` | Planner sub-agent (sprint planning) |

## Environment Variables Required
- `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`

## Common Issues
| Issue | Fix |
|---|---|
| JIRA 400 on story creation | Epic key not in `parent` field — check `analysis.js` story body |
| Subtask rejected | Parent must be a Story, not an Epic — check issue type hierarchy |
| Missing env vars | Copy `.env.example` → `.env` and fill all JIRA vars |
