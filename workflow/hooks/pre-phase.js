require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const REQUIRED_ENV = {
  analysis:      ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'JIRA_PROJECT_KEY', 'ANTHROPIC_API_KEY'],
  plan:          ['JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'ANTHROPIC_API_KEY'],
  design:        ['CONFLUENCE_BASE_URL', 'CONFLUENCE_SPACE_KEY', 'ANTHROPIC_API_KEY'],
  development:   ['GITHUB_PAT', 'GITHUB_OWNER', 'GITHUB_REPO', 'ANTHROPIC_API_KEY'],
  documentation: ['CONFLUENCE_BASE_URL', 'CONFLUENCE_SPACE_KEY', 'GITHUB_PAT', 'ANTHROPIC_API_KEY'],
  build:         ['GITHUB_PAT', 'GITHUB_OWNER', 'GITHUB_REPO'],
};

async function prePhaseHook(phaseName, context = {}) {
  const required = REQUIRED_ENV[phaseName] || [];
  const missing = required.filter(k => !process.env[k]);

  if (missing.length) {
    throw new Error(
      `Pre-phase validation failed for "${phaseName}". Missing env vars: ${missing.join(', ')}\n` +
      'Copy .env.example to .env and fill in the required values.'
    );
  }

  console.log(`[pre-phase:${phaseName}] All prerequisites satisfied.`);
  return { phase: phaseName, validated: true, context };
}

module.exports = { prePhaseHook };
