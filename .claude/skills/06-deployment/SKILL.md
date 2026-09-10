---
name: 06-deployment
description: Run CSTS pipeline Phase 6 — Deployment. Publishes documentation to Confluence and README to GitHub, then builds and packages the production artifact into dist/. Triggers on: "run deployment phase", "start phase 6", "build production artifact", "package the app", "prepare for Render deployment".
---

# Skill: Run Deployment Phase

## When to Use
Use this skill to run CSTS pipeline Phase 6 — Deployment. It publishes documentation to Confluence and README to GitHub, then builds and packages the production artifact into `dist/`.

## Trigger Phrases
- "run deployment phase"
- "start phase 6"
- "build production artifact"
- "package the app"
- "publish documentation"
- "prepare for Render deployment"

---

## Instructions

### Step 1 — Run the phase module
```bash
node workflow/phases/deployment.js
```
Or run the two sub-modules individually:
```bash
node workflow/phases/documentation.js   # publish docs
node workflow/phases/build.js           # build artifact
```

### Step 2 — Review documentation output
```
[documentation] README.md written to repo root.
[documentation] Updated: "CSTS — Functional Requirements Document (YYYY-MM-DD)" → https://...
[documentation] Updated: "CSTS — API Documentation (YYYY-MM-DD)" → https://...
[documentation] All documentation published.
```

### Step 3 — Review build output
```
[build] ARTIFACT READY
[build]   Location   : .../dist
[build]   Frontend   : 7 files in dist/public/
[build]   Backend    : 651 files in dist/server/
[build]   Start      : NODE_ENV=production node dist/server/server.js
[build]   Local URL  : http://localhost:3000
[build]   Production : (set RENDER_URL in .env after deploying to Render.com)
```

### Step 4 — Verify the artifact locally (optional)
```bash
NODE_ENV=production node dist/server/server.js
# Visit http://localhost:3000 — should serve the React app
```

### Step 5 — Deploy to Render.com
1. Push `main` branch to GitHub (the artifact is built from source, not `dist/`)
2. Go to https://render.com → New Web Service → connect `SubhasriGit/Customer-Support-Ticket-System`
3. Render reads `render.yaml` and deploys automatically
4. After deploy, copy the URL and add to `.env`:
   ```
   RENDER_URL=https://your-app.onrender.com
   ```

### Step 6 — HITL
Type `approve` to advance to Maintenance.

---

## Tech Writer Sub-Module (documentation.js)
Performs these steps in order:
1. Write `README.md` to repo root
2. Upsert `"CSTS — Functional Requirements Document ({date})"` to Confluence
3. Upsert `"CSTS — API Documentation ({date})"` to Confluence

---

## DevOps Sub-Module (build.js)
Performs these steps in order:
1. `npm install --legacy-peer-deps` + `npm run build` in `frontend/`
2. `npm install` in `backend/`
3. Copy `frontend/build/` → `dist/public/`
4. Copy `backend/` (excluding `node_modules`, `.env`, `*.sqlite`) → `dist/server/`
5. `npm install --production` in `dist/server/`
6. Verify: `dist/public/index.html`, `dist/server/server.js`, `dist/server/db/database.js` exist
7. Smoke test: `node -e "process.env.PORT=0; require('./server')"` from `dist/server/`

---

## Confluence Upsert Pattern
```
GET /rest/api/content?title={encoded}&spaceKey={CONFLUENCE_SPACE_KEY}&expand=version
→ exists: PUT /rest/api/content/{id}  (body: version.number + 1)
→ new:    POST /rest/api/content
```
All pages use `storage` representation.

---

## HITL Checkpoint
After both sub-modules complete, state:
> "HITL REVIEW REQUIRED — Docs published, artifact built. Start with `NODE_ENV=production node dist/server/server.js` to verify locally. Approve to proceed to Maintenance."

---

## Key Files
| File | Purpose |
|---|---|
| `workflow/phases/deployment.js` | Orchestrates documentation + build |
| `workflow/phases/documentation.js` | Tech Writer — README + Confluence docs |
| `workflow/phases/build.js` | DevOps — React build + artifact packaging |
| `render.yaml` | Render.com deployment config |
| `dist/` | Output artifact (not committed to git) |

## Artifact Structure
```
dist/
├── public/    ← React production build
└── server/    ← Backend + node_modules (production deps only)
```

## Environment Variables Required
- `JIRA_EMAIL`, `JIRA_API_TOKEN`, `CONFLUENCE_BASE_URL`, `CONFLUENCE_SPACE_KEY`
- `RENDER_URL` (optional — set after first deploy)

## Common Issues
| Issue | Fix |
|---|---|
| `npm run build` fails | Run `cd frontend && npm install --legacy-peer-deps` first |
| Smoke test fails | Check `backend/.env` — server needs `PORT` and `DB_PATH` at minimum |
| Confluence 400 | Upsert pattern auto-handles duplicate titles — check auth vars |
| `dist/` is huge | Normal — `dist/server/node_modules/` contains all prod deps (651 files) |
