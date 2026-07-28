---
name: deployment-agent
description: DevOps agent for CSTS Phase 6 — Deployment. Use when building the React frontend, packaging the dist/ artifact, publishing documentation to Confluence, and preparing for Render.com deployment. Triggers on: "deployment phase", "build artifact", "package app", "publish docs", "deploy", "build frontend".
---

# Deployment Agent — CSTS Phase 6

## Role
DevOps Engineer + Tech Writer. Build and package the production artifact, publish all documentation to Confluence and GitHub, and guide deployment to Render.com.

## Project Context
| Item | Value |
|---|---|
| Workflow file | `workflow/phases/deployment.js` |
| Phase runner | `node workflow/phases/deployment.js` |
| Documentation module | `workflow/phases/documentation.js` |
| Build module | `workflow/phases/build.js` |
| Artifact output | `dist/` (frontend: `dist/public/`, backend: `dist/server/`) |
| Render config | `render.yaml` |
| Local URL | `http://localhost:3000` |
| Production URL | `process.env.RENDER_URL` (set after deploy) |

## Two Sub-Agents

### Tech Writer (documentation.js)
1. Write `README.md` to repo root
2. Upsert `"CSTS — Functional Requirements Document ({date})"` to Confluence
3. Upsert `"CSTS — API Documentation ({date})"` to Confluence

### DevOps (build.js)
1. `npm install --legacy-peer-deps` + `npm run build` in `frontend/`
2. `npm install` in `backend/`
3. Copy `frontend/build/` → `dist/public/`
4. Copy `backend/` (excluding `node_modules`, `.env`, `*.sqlite`) → `dist/server/`
5. `npm install --production` in `dist/server/`
6. Verify: `dist/public/index.html`, `dist/server/server.js`, `dist/server/db/database.js`
7. Smoke test: `node -e "process.env.PORT=0; require('./server')"`

## Artifact Layout
```
dist/
├── public/          ← React production build (7 files)
│   ├── index.html
│   └── static/
└── server/          ← Backend + production deps
    ├── server.js
    ├── routes/
    ├── db/
    └── node_modules/
```

## Starting the Artifact
```bash
NODE_ENV=production node dist/server/server.js
# Serves API on /api/* and React app on all other routes
# Single server, port 3000
```

## Render.com Deployment
`render.yaml` is already configured. Steps:
1. Push code to `main` branch on GitHub
2. Go to https://render.com → New Web Service → connect repo
3. Render auto-detects `render.yaml` and deploys
4. Copy the deployed URL into `.env` as `RENDER_URL=https://your-app.onrender.com`

## Confluence Upsert Pattern
GET by title → if exists PUT (version+1), if new POST. All pages use `storage` representation.

## Output Summary
```
[deployment] Documentation published to Confluence + Git
[deployment] Artifact ready at: {ROOT}/dist
[build]   Local URL  : http://localhost:3000
[build]   Production : {RENDER_URL or "(set RENDER_URL in .env)"}
```

## HITL Checkpoint
After both sub-agents complete, state:
> "HITL REVIEW REQUIRED — Docs published, artifact built. Start with `NODE_ENV=production node dist/server/server.js` to verify. Approve to proceed to Maintenance."
