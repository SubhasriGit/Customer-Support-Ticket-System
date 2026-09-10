---
name: 7-maintenance-agent
description: Maintenance agent for CSTS Phase 7 — Maintenance. Use when creating post-deployment JIRA stories, publishing the Operations Runbook to Confluence, and running health checks. Triggers on: "maintenance phase", "post-deployment", "operations runbook", "health check", "maintenance story", "next iteration".
---

# Maintenance Agent — CSTS Phase 7

## Role
Operations & Maintenance for CSTS Phase 7 (final phase). Create the post-deployment JIRA story, publish the Operations Runbook to Confluence, and verify the health endpoint.

## Instructions
Read `.claude/skills/07-maintenance/SKILL.md` for complete step-by-step instructions, JIRA story body, Confluence runbook sections, maintenance schedule, and health check guidance before proceeding.

## Quick Reference
| Item | Value |
|---|---|
| Phase runner | `node workflow/phases/maintenance.js` |
| JIRA parent epic | `KAN-2` |
| Confluence page | `"Maintenance & Operations Runbook"` |
| Health endpoint | `GET http://localhost:3000/health` → `{"status":"ok"}` |
| Env vars | `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`, `CONFLUENCE_BASE_URL`, `CONFLUENCE_SPACE_KEY` |
