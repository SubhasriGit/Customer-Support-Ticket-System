---
name: 03-design
description: Run CSTS pipeline Phase 3 — Design. Produces four Confluence artifacts: Architecture Document, High Level Design, Low Level Design, and Wireframes. Triggers on: "run design phase", "start phase 3", "generate architecture documents", "publish design to Confluence", "create HLD and LLD".
---

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

## Artifact Content Guidelines

### 1. Architecture Document (`CSTS — Architecture Document ({date})`)
- System overview: React SPA → Express REST API → SQLite → Claude AI
- Layer diagram (see below)
- Component responsibilities table
- Non-functional requirements (performance, security, scalability)

### System Architecture Diagram
```
┌─────────────────────────────────┐
│   React 18 SPA (frontend/src)   │
└──────────────┬──────────────────┘
               │ HTTP REST
┌──────────────▼──────────────────┐
│   Express 4 API (backend/)      │
│   Routes: tickets, analytics,   │
│   suggestions, health           │
└──────┬──────────────┬───────────┘
       │              │
┌──────▼──────┐  ┌────▼──────────┐
│  node:sqlite │  │  Claude API   │
│  (DB layer)  │  │  (via MCP)    │
└─────────────┘  └───────────────┘
```

### 2. High Level Design (`CSTS — High Level Design ({date})`)
- Feature breakdown per sprint story
- Data flow between layers for each feature
- External integrations (Claude API, JIRA, Confluence, GitHub) with auth method + usage
- Deployment topology (single Express server on port 3000 serving frontend build)

### 3. Low Level Design (`CSTS — Low Level Design ({date})`)
- API endpoint signatures: `METHOD /path` → request/response shapes
- DB schema changes per feature (table, columns, types, constraints)
- React component tree per new feature
- Service layer contracts (input → output)
- Error response contract

### 4. Wireframes (`CSTS — Wireframes ({date})`)
- ASCII or HTML wireframe for each new UI screen
- Element labels **must** match `data-testid` values used in `tests/steps/*.steps.js`

---

## Page Title Pattern
All titles include today's date: `CSTS — {Type} ({YYYY-MM-DD})`
On repeated runs the pages are **updated** (PUT with version+1), never duplicated.

---

## Confluence Upsert Pattern
```
GET /rest/api/content?title={encoded}&spaceKey={CONFLUENCE_SPACE_KEY}&expand=version
→ exists: PUT /rest/api/content/{id}  (body: version.number + 1)
→ new:    POST /rest/api/content
```

---

## HITL Checkpoint
After all four documents are published, state:
> "HITL REVIEW REQUIRED — 4 Confluence artifacts published. Review at {baseUrl}. Approve to proceed to Development."

---

## Key Files
| File | Purpose |
|---|---|
| `workflow/phases/design.js` | Phase runner — generates and publishes all 4 artifacts |

## Environment Variables Required
- `JIRA_EMAIL`, `JIRA_API_TOKEN` (used for Confluence auth)
- `CONFLUENCE_BASE_URL`, `CONFLUENCE_SPACE_KEY`

## Common Issues
| Issue | Fix |
|---|---|
| Confluence 400 on update | Version mismatch — the upsert GET fetches current version automatically |
| Wrong date in page title | System clock — pages are titled with today's date at run time |
| Missing pages | Check `CONFLUENCE_SPACE_KEY` is correct and the account has create permission |
