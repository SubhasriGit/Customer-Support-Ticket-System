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
