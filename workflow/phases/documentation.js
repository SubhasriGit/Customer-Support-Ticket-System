require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * Documentation Phase Agent (Tech Writer Persona)
 * - Writes README.md to repo root
 * - Publishes FRD and API docs to Confluence
 */

const CONF_BASE  = process.env.CONFLUENCE_BASE_URL;
const CONF_SPACE = process.env.CONFLUENCE_SPACE_KEY;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_TOKEN = process.env.JIRA_API_TOKEN;

function confluenceRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');
    const url = new URL(CONF_BASE + path);
    const b = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(b ? { 'Content-Length': Buffer.byteLength(b) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (b) req.write(b);
    req.end();
  });
}

async function createConfluencePage(title, content, parentId = null) {
  const body = {
    type: 'page',
    title,
    space: { key: CONF_SPACE },
    body: { storage: { value: content, representation: 'storage' } },
    ...(parentId ? { ancestors: [{ id: parentId }] } : {}),
  };
  const res = await confluenceRequest('POST', '/rest/api/content', body);
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Confluence page creation failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  const link = CONF_BASE + res.body._links?.webui;
  console.log(`[documentation] Published: "${title}" → ${link}`);
  return res.body;
}

// ─── README content ───────────────────────────────────────────────────────────

const README_CONTENT = `# Customer Support Ticket System

AI-Enhanced Customer Support platform built as part of the **mm-learning-group-1 capstone** — demonstrating AI-driven SDLC orchestration with CodeMie assistants, HITL gates, and self-healing automation.

## Features

| Feature | Sprint | Status |
|---------|--------|--------|
| Submit and track support tickets | Base | ✅ |
| AI-powered ticket triage (category + priority) | Sprint 1 | ✅ |
| Priority and severity scoring with badges | Sprint 1 | ✅ |
| SLA tracking and breach alerts | Sprint 2 | ✅ |
| Analytics dashboard (KPI cards + charts) | Sprint 3 | ✅ |
| AI auto-response suggestions | Sprint 3 | ✅ |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 |
| Backend | Node.js 24 / Express 4 |
| Database | SQLite via \`node:sqlite\` (built-in, no native compilation) |
| Testing | Playwright with self-healing selectors |
| Build | npm scripts |
| AI | Claude API (via CodeMie MCP) with keyword fallback |

## Prerequisites

- Node.js >= 22.5 (uses built-in \`node:sqlite\`)
- npm >= 9

## Setup

\`\`\`bash
# 1. Clone and configure environment
cp .env.example .env
# Edit .env and fill in: JIRA_API_TOKEN, GITHUB_PAT, CONFLUENCE_SPACE_KEY, ANTHROPIC_API_KEY

# 2. Install pre-commit hook (blocks hardcoded secrets)
npm run setup:hooks

# 3. Install dependencies
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
\`\`\`

## Run

\`\`\`bash
# Backend (port 3001)
cd backend && npm start

# Frontend (port 3000) — new terminal
cd frontend && npm start
\`\`\`

Open http://localhost:3000

## Run Tests

\`\`\`bash
cd tests
npm install
npx playwright install chromium
npx playwright test
npx playwright show-report   # view HTML report
\`\`\`

## Run SDLC Workflow

Each phase can be triggered individually after the previous HITL gate is approved:

\`\`\`bash
node workflow/phases/analysis.js      # BA: create JIRA EPICs/Stories/Tasks
node workflow/phases/plan.js          # Planner: sprint plan + JIRA updates
node workflow/phases/design.js        # Architect: publish to Confluence
node workflow/phases/documentation.js # Tech Writer: README + FRD
node workflow/phases/build.js         # DevOps: build artifact
\`\`\`

Or run the full pipeline from any phase:
\`\`\`bash
node workflow/orchestrator.js [analysis|plan|design|development|documentation|build]
\`\`\`

## Project Structure

\`\`\`
├── frontend/                  React 18 application
│   └── src/
│       ├── components/        TicketForm, TicketList, Dashboard, SuggestedReply
│       └── services/api.js    REST client
├── backend/                   Express 4 API
│   ├── db/
│   │   ├── database.js        Migration runner (node:sqlite)
│   │   └── migrations/        001-004 versioned SQL migrations
│   ├── routes/                tickets, analytics, suggestions
│   └── services/              triageService (Claude API + keyword fallback)
├── workflow/                  AI-driven SDLC pipeline
│   ├── phases/                analysis, plan, design, development, documentation, build
│   ├── hooks/                 pre-phase, post-phase, on-failure (retry + backoff)
│   ├── hitl/                  GitHub PR-based HITL reviewer
│   └── self-healing/          Playwright selector healer
├── tests/
│   └── specs/tickets.spec.js  Playwright E2E with resilient locators
├── scripts/setup-hooks.js     Cross-platform pre-commit hook installer
└── .github/hooks/pre-commit   Secret detection hook
\`\`\`

## Security

- The pre-commit hook blocks any hardcoded API keys, tokens, or passwords before commit.
- All credentials are stored in \`.env\` (gitignored). Never commit the \`.env\` file.
- The \`.env.example\` file contains only placeholder values and is safe to commit.

## Contributing

1. Create a feature branch: \`git checkout -b feature/your-feature\`
2. Run the SDLC pipeline agents for analysis and planning
3. Submit a PR — the HITL reviewer will request human approval before merge

---

*Generated by AI Tech Writer Agent — SDLC Phase 5 (Documentation) | mm-learning-group-1*
`;

// ─── FRD content ──────────────────────────────────────────────────────────────

const FRD_CONTENT = `
<h2>Functional Requirements Document — AI-Enhanced Customer Support Ticket System</h2>
<p><em>Generated by AI Tech Writer Agent | SDLC Phase 5 — Documentation | mm-learning-group-1 | 2026-07-23</em></p>

<h3>1. Purpose and Scope</h3>
<p>This document defines the functional requirements for the AI-Enhanced Customer Support Ticket System (CSTS). The system provides a web-based interface for customers to submit support tickets and for support agents to manage, triage, and resolve them. AI capabilities are layered on top of the base application across three sprints.</p>

<h3>2. Stakeholders</h3>
<table>
  <tbody>
    <tr><th>Role</th><th>Responsibilities</th></tr>
    <tr><td>Customer</td><td>Submit support tickets; receive responses</td></tr>
    <tr><td>Support Agent</td><td>View, triage, respond to, and close tickets</td></tr>
    <tr><td>Support Manager</td><td>Monitor analytics dashboard; track SLA compliance</td></tr>
    <tr><td>Developer / DevOps</td><td>Deploy and maintain the system</td></tr>
  </tbody>
</table>

<h3>3. Functional Requirements</h3>

<h4>FR-01: Ticket Submission</h4>
<p><strong>Description:</strong> The system shall allow customers to submit support tickets via a web form.</p>
<p><strong>Priority:</strong> High | <strong>Story:</strong> Base</p>
<p><strong>Acceptance Criteria:</strong></p>
<ul>
  <li>Form fields: Title (required), Email (required), Description (required)</li>
  <li>All fields validated; errors shown inline</li>
  <li>On submit: ticket created, triage runs, ticket appears in list</li>
</ul>

<h4>FR-02: AI Ticket Triage (KAN-3)</h4>
<p><strong>Description:</strong> The system shall automatically assign a category and priority to every new ticket using AI.</p>
<p><strong>Priority:</strong> High | <strong>Story Points:</strong> 8 | <strong>Sprint:</strong> 1</p>
<p><strong>Acceptance Criteria:</strong></p>
<ul>
  <li>Category assigned: <code>technical</code> | <code>billing</code> | <code>general</code></li>
  <li>Priority assigned: <code>high</code> | <code>medium</code> | <code>low</code></li>
  <li>Claude API used when ANTHROPIC_API_KEY configured; keyword matching as fallback</li>
  <li>Category and priority badges visible on ticket cards</li>
</ul>

<h4>FR-03: Priority and Severity Scoring (KAN-7)</h4>
<p><strong>Description:</strong> Tickets shall be visually differentiated by priority using colour-coded badges.</p>
<p><strong>Priority:</strong> High | <strong>Story Points:</strong> 5 | <strong>Sprint:</strong> 1</p>
<p><strong>Acceptance Criteria:</strong></p>
<ul>
  <li>High priority: red badge</li>
  <li>Medium priority: yellow badge</li>
  <li>Low priority: green badge</li>
  <li>Ticket list sortable/filterable by status</li>
</ul>

<h4>FR-04: SLA Tracking and Breach Alerts (KAN-11)</h4>
<p><strong>Description:</strong> The system shall enforce SLA deadlines per priority and display a live countdown.</p>
<p><strong>Priority:</strong> High | <strong>Story Points:</strong> 8 | <strong>Sprint:</strong> 2</p>
<p><strong>Acceptance Criteria:</strong></p>
<ul>
  <li>SLA windows: High = 4h, Medium = 8h, Low = 24h</li>
  <li>Countdown timer displayed on each open ticket card</li>
  <li>Countdown turns red when &lt; 1 hour remaining</li>
  <li><code>sla_breached</code> flag set when SLA window expires and ticket still open</li>
  <li>"SLA Breached" badge shown in place of countdown after breach</li>
</ul>

<h4>FR-05: Auto-Response Suggestions (KAN-19)</h4>
<p><strong>Description:</strong> The system shall suggest AI-generated reply templates for support agents.</p>
<p><strong>Priority:</strong> Medium | <strong>Story Points:</strong> 13 | <strong>Sprint:</strong> 3</p>
<p><strong>Acceptance Criteria:</strong></p>
<ul>
  <li>"💡 Suggest Reply" button appears on open ticket cards</li>
  <li>AI-generated reply pre-populated in editable textarea</li>
  <li>Agent can accept, edit, or discard the suggestion</li>
  <li>Accepted/saved responses recorded in <code>responses</code> table</li>
</ul>

<h4>FR-06: Analytics Dashboard (KAN-15)</h4>
<p><strong>Description:</strong> The system shall provide a dashboard summarising ticket volume and performance metrics.</p>
<p><strong>Priority:</strong> Medium | <strong>Story Points:</strong> 8 | <strong>Sprint:</strong> 3</p>
<p><strong>Acceptance Criteria:</strong></p>
<ul>
  <li>KPI cards: Total, Open, Closed, SLA Breaches, Avg Resolution Time</li>
  <li>Bar charts: by category, by priority, volume over last 7 days</li>
  <li>Dashboard accessible via "Analytics" tab in top nav</li>
</ul>

<h3>4. Non-Functional Requirements</h3>
<ul>
  <li><strong>Performance:</strong> API p95 response &lt; 500ms; analytics query &lt; 1s</li>
  <li><strong>Security:</strong> No secrets in code; pre-commit hook enforced; HTTPS in production</li>
  <li><strong>Testability:</strong> All interactive elements have <code>data-testid</code>; Playwright self-healing covers selector drift</li>
  <li><strong>Portability:</strong> SQLite via Node built-in — no C++ build tools required</li>
</ul>

<h3>5. Out of Scope</h3>
<ul>
  <li>Email notification delivery (SLA alerts are visual-only in this release)</li>
  <li>User authentication and role-based access control</li>
  <li>Multi-tenant support</li>
  <li>Production deployment and hosting</li>
</ul>

<h3>6. Glossary</h3>
<table>
  <tbody>
    <tr><th>Term</th><th>Definition</th></tr>
    <tr><td>CSTS</td><td>Customer Support Ticket System</td></tr>
    <tr><td>HITL</td><td>Human-in-the-Loop — manual approval gate between SDLC phases</td></tr>
    <tr><td>SLA</td><td>Service Level Agreement — maximum response time per priority</td></tr>
    <tr><td>Triage</td><td>Automatic classification of a ticket's category and priority by AI</td></tr>
    <tr><td>CodeMie</td><td>EPAM AI platform providing Claude Code CLI and MCP integration</td></tr>
  </tbody>
</table>
`;

// ─── API docs content ─────────────────────────────────────────────────────────

const API_DOCS_CONTENT = `
<h2>API Documentation — Customer Support Ticket System</h2>
<p><em>Generated by AI Tech Writer Agent | 2026-07-23</em></p>
<p>Base URL: <code>http://localhost:3001</code></p>

<h3>Authentication</h3>
<p>No authentication required (development scope). Add Bearer token middleware before production deployment.</p>

<h3>Endpoints</h3>

<h4>GET /health</h4>
<p>Health check.</p>
<p><strong>Response 200:</strong> <code>{ "status": "ok" }</code></p>

<h4>GET /api/tickets</h4>
<p>List all tickets ordered by creation date descending. SLA breach flags are updated inline.</p>
<p><strong>Response 200:</strong> Array of ticket objects.</p>
<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">json</ac:parameter><ac:plain-text-body><![CDATA[
[{
  "id": 1, "title": "Login broken", "description": "...", "email": "user@example.com",
  "status": "open", "category": "technical", "priority": "high",
  "sla_due_at": "2026-07-23T14:22:05.573Z", "sla_breached": 0,
  "created_at": "2026-07-23 10:22:05", "updated_at": "2026-07-23 10:22:05"
}]
]]></ac:plain-text-body></ac:structured-macro>

<h4>POST /api/tickets</h4>
<p>Create a ticket. AI triage (category + priority) and SLA deadline are set automatically.</p>
<p><strong>Request Body:</strong></p>
<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">json</ac:parameter><ac:plain-text-body><![CDATA[{ "title": "string (required)", "description": "string (required)", "email": "string (required)" }]]></ac:plain-text-body></ac:structured-macro>
<p><strong>Response 201:</strong> Created ticket object (includes category, priority, sla_due_at).</p>
<p><strong>Response 400:</strong> <code>{ "error": "title, description, and email are required" }</code></p>

<h4>PATCH /api/tickets/:id/status</h4>
<p>Toggle ticket status.</p>
<p><strong>Request Body:</strong> <code>{ "status": "open" | "closed" }</code></p>
<p><strong>Response 200:</strong> Updated ticket object.</p>
<p><strong>Response 404:</strong> <code>{ "error": "Ticket not found" }</code></p>

<h4>GET /api/tickets/:id/suggest-reply</h4>
<p>Get an AI-generated reply suggestion for a ticket. Uses Claude API if configured, falls back to template.</p>
<p><strong>Response 200:</strong> <code>{ "suggestion": "string" }</code></p>

<h4>PATCH /api/tickets/:id/response</h4>
<p>Save agent response (accepted or discarded suggestion).</p>
<p><strong>Request Body:</strong> <code>{ "response": "string (required)", "accepted": boolean }</code></p>
<p><strong>Response 200:</strong> <code>{ "id": number, "response": "string", "accepted": boolean }</code></p>

<h4>GET /api/analytics</h4>
<p>Aggregated metrics for the dashboard.</p>
<p><strong>Response 200:</strong></p>
<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">json</ac:parameter><ac:plain-text-body><![CDATA[
{
  "total": 22, "open": 14, "closed": 8, "slaBreaches": 3,
  "avgResolutionMs": 15120000,
  "byCategory": [{ "category": "technical", "count": 12 }],
  "byPriority": [{ "priority": "high", "count": 7 }],
  "volumeByDay": [{ "day": "2026-07-23", "count": 5 }]
}
]]></ac:plain-text-body></ac:structured-macro>
`;

async function run({ feedback } = {}) {
  console.log('[documentation] Tech Writer Agent starting...');
  if (feedback) console.log(`[documentation] Incorporating feedback: ${feedback}`);

  // 1. Write README to repo root
  const readmePath = path.join(__dirname, '../../README.md');
  fs.writeFileSync(readmePath, README_CONTENT, 'utf8');
  console.log('[documentation] README.md written to repo root.');

  // 2. Publish FRD to Confluence
  const frd = await createConfluencePage('CSTS — Functional Requirements Document (2026-07-23)', FRD_CONTENT);

  // 3. Publish API docs as child of FRD
  await createConfluencePage('CSTS — API Documentation (2026-07-23)', API_DOCS_CONTENT, frd.id);

  console.log('\n[documentation] All documentation published.');
  console.log('[documentation] HITL REVIEW REQUIRED — Review README in repo root and docs in Confluence.');

  return { readmePath, frdId: frd.id, confluenceUrl: CONF_BASE + frd._links?.webui };
}

module.exports = { run };

if (require.main === module) {
  run().catch(err => { console.error('[documentation] Failed:', err.message); process.exit(1); });
}
