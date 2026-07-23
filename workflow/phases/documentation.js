require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');

/**
 * Documentation Phase Agent (Tech Writer Persona)
 * - Generates README and commits to repo
 * - Publishes FRD to Confluence
 */

const README_CONTENT = `# Customer Support Ticket System

AI-Enhanced Customer Support platform built as part of the mm-learning-group-1 capstone project.

## Features
- Submit and track support tickets
- AI-powered ticket triage and categorisation
- Priority and severity scoring
- SLA tracking and breach alerts
- Analytics dashboard
- Auto-response suggestions

## Tech Stack
| Layer | Technology |
|---|---|
| Frontend | React 18 |
| Backend | Node.js / Express |
| Database | SQLite (better-sqlite3) |
| Testing | Playwright (with self-healing) |
| Build | npm scripts |
| AI | Claude API via CodeMie MCP |

## Getting Started

### Prerequisites
- Node.js >= 18
- npm >= 9

### Setup
\`\`\`bash
cp .env.example .env
# Fill in your credentials in .env

# Backend
cd backend && npm install && npm start

# Frontend (new terminal)
cd frontend && npm install && npm start
\`\`\`

### Run Tests
\`\`\`bash
cd tests && npx playwright test
\`\`\`

### Run SDLC Workflow
\`\`\`bash
node workflow/orchestrator.js [phase]
# phase: analysis | plan | design | development | documentation | build
\`\`\`

## Project Structure
\`\`\`
├── frontend/          React application
├── backend/           Express API + SQLite
├── workflow/          SDLC orchestration pipeline
│   ├── phases/        Per-phase AI agents
│   ├── hooks/         pre/post/on-failure hooks
│   ├── hitl/          GitHub PR-based HITL reviewer
│   └── self-healing/  Playwright selector healer
├── tests/             Playwright E2E tests
└── scripts/           Build scripts
\`\`\`

## Security
- Never commit secrets. The pre-commit hook blocks any hardcoded API keys, tokens, or passwords.
- All credentials must be stored in \`.env\` (gitignored).
`;

async function run({ feedback } = {}) {
  console.log('[documentation] Tech Writer Agent starting...');

  const readmePath = path.join(__dirname, '../../README.md');
  fs.writeFileSync(readmePath, README_CONTENT, 'utf8');
  console.log('[documentation] README.md written to repo root.');

  // Confluence FRD would be published here using the same confluenceRequest helper from design.js
  console.log('[documentation] FRD would be published to Confluence here.');

  return { readmePath, confluenceUrl: process.env.CONFLUENCE_BASE_URL };
}

module.exports = { run };
