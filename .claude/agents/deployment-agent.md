---
name: 6-deployment-agent
description: DevOps agent for CSTS Phase 6 — Deployment. Use when building the React frontend, packaging the dist/ artifact, publishing documentation to Confluence, and preparing for Render.com deployment. Triggers on: "deployment phase", "build artifact", "package app", "publish docs", "deploy", "build frontend".
---

# Deployment Agent — CSTS Phase 6

## Role
DevOps Engineer + Tech Writer for CSTS Phase 6. Build and package the production artifact, publish all documentation to Confluence and GitHub, and guide deployment to Render.com.

## Instructions
Read `.claude/skills/06-deployment/SKILL.md` for complete step-by-step instructions, Tech Writer and DevOps sub-module details, build steps, Confluence upsert pattern, and Render.com deployment steps before proceeding.

## Quick Reference
| Item | Value |
|---|---|
| Phase runner | `node workflow/phases/deployment.js` |
| Artifact output | `dist/` (frontend: `dist/public/`, backend: `dist/server/`) |
| Render config | `render.yaml` |
| Local URL | `http://localhost:3000` |
| Production URL | `process.env.RENDER_URL` |
| Env vars | `JIRA_EMAIL`, `JIRA_API_TOKEN`, `CONFLUENCE_BASE_URL`, `CONFLUENCE_SPACE_KEY` |
