require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { runSecretScan } = require('./secret-scan');

const REQUIRED_ENV = {
  requirement_analysis: ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'JIRA_PROJECT_KEY', 'ANTHROPIC_API_KEY'],
  app_analysis:         ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'JIRA_PROJECT_KEY', 'ANTHROPIC_API_KEY'],
  design:               ['CONFLUENCE_BASE_URL', 'CONFLUENCE_SPACE_KEY', 'ANTHROPIC_API_KEY'],
  development:          ['GITHUB_PAT', 'GITHUB_OWNER', 'GITHUB_REPO', 'ANTHROPIC_API_KEY'],
  testing:              ['ANTHROPIC_API_KEY'],
  deployment:           ['GITHUB_PAT', 'GITHUB_OWNER', 'GITHUB_REPO', 'RENDER_API_KEY', 'RENDER_SERVICE_ID'],
  maintenance:          ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'CONFLUENCE_BASE_URL', 'CONFLUENCE_SPACE_KEY'],
};

// Secret scan runs once — only before the first phase of the pipeline
const FIRST_PHASE = 'requirement_analysis';

async function prePhaseHook(phaseName, context = {}) {
  // ── Secret scan (first phase only) ────────────────────────────────────────
  if (phaseName === FIRST_PHASE) {
    const scan = runSecretScan();
    if (!scan.passed) {
      throw new Error(
        `[pre-phase] Secret scan failed — ${scan.findings.length} hardcoded secret(s) detected in source code.\n` +
        'Move all secrets to .env and reference them via process.env.*\n' +
        'Run: node workflow/hooks/secret-scan.js   for a full report.'
      );
    }
  }

  // ── Required env-var check ─────────────────────────────────────────────────
  const required = REQUIRED_ENV[phaseName] || [];
  const missing  = required.filter(k => !process.env[k]);

  if (missing.length) {
    throw new Error(
      `Pre-phase validation failed for "${phaseName}". Missing env vars: ${missing.join(', ')}\n` +
      'Copy .env.example to .env and fill in the required values.'
    );
  }

  console.log(`[pre-phase:${phaseName}] ✅ All prerequisites satisfied.`);
  return { phase: phaseName, validated: true, context };
}

module.exports = { prePhaseHook };
