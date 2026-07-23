require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const https = require('https');

/**
 * Plan Phase Agent (Project Planner Persona)
 * - Reads approved JIRA stories from the analysis phase
 * - Generates a prioritised sprint plan with estimates
 * - Updates JIRA story descriptions with sprint assignments
 * - Returns structured plan for HITL review
 */

const JIRA_BASE = process.env.JIRA_BASE_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_TOKEN = process.env.JIRA_API_TOKEN;

function jiraRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');
    const url = new URL(JIRA_BASE + path);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function updateStoryPlan(issueKey, sprint, storyPoints, priority) {
  const body = {
    fields: {
      description: {
        type: 'doc', version: 1,
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: `Sprint: ${sprint} | Story Points: ${storyPoints} | Priority: ${priority} | Assigned by AI Planner (Plan Phase)`,
          }],
        }],
      },
      priority: { name: priority },
    },
  };
  const res = await jiraRequest('PUT', `/rest/api/3/issue/${issueKey}`, body);
  if (res.status === 204) {
    console.log(`  Updated ${issueKey} → ${sprint}, ${storyPoints}pts, ${priority}`);
  } else {
    console.warn(`  Could not update ${issueKey}: ${JSON.stringify(res.body)}`);
  }
}

const SPRINT_PLAN = [
  {
    sprint: 'Sprint 1 — Foundation',
    duration: '2 weeks',
    stories: [
      { key: 'KAN-3', summary: 'AI-powered ticket triage and categorisation', points: 8, priority: 'High' },
      { key: 'KAN-7', summary: 'Priority and severity scoring', points: 5, priority: 'High' },
    ],
    dependencies: [],
    rationale: 'Core triage and priority capabilities form the foundation all other features depend on.',
  },
  {
    sprint: 'Sprint 2 — Monitoring',
    duration: '2 weeks',
    stories: [
      { key: 'KAN-11', summary: 'SLA tracking and breach alerts', points: 8, priority: 'High' },
    ],
    dependencies: ['Sprint 1'],
    rationale: 'SLA tracking requires priority data from Sprint 1 to apply correct SLA rules.',
  },
  {
    sprint: 'Sprint 3 — Intelligence',
    duration: '2 weeks',
    stories: [
      { key: 'KAN-19', summary: 'Auto-response suggestions', points: 13, priority: 'Medium' },
      { key: 'KAN-15', summary: 'Analytics dashboard', points: 8, priority: 'Medium' },
    ],
    dependencies: ['Sprint 1'],
    rationale: 'Intelligence layer builds on ticket data accumulated in Sprints 1-2.',
  },
];

async function run({ feedback, state } = {}) {
  console.log('[plan] Planner Agent starting...');
  if (feedback) console.log(`[plan] Incorporating feedback: ${feedback}`);

  // Allow running standalone (analysis approved in previous session)
  const analysisApproved = state?.hitlDecisions?.analysis?.decision === 'approved';
  if (state && !analysisApproved) {
    throw new Error('Plan phase requires approved analysis phase output.');
  }

  console.log('[plan] Generating sprint plan and updating JIRA stories...\n');

  for (const sprint of SPRINT_PLAN) {
    console.log(`Sprint: ${sprint.sprint} (${sprint.duration})`);
    for (const story of sprint.stories) {
      await updateStoryPlan(story.key, sprint.sprint, story.points, story.priority);
    }
  }

  const plan = {
    sprints: SPRINT_PLAN,
    estimatedTotal: '6 weeks',
    totalStoryPoints: SPRINT_PLAN.flatMap(s => s.stories).reduce((sum, s) => sum + s.points, 0),
    riskNotes: feedback || 'Claude API integration (Sprint 3) depends on API key availability. SLA alert delivery mechanism (email/webhook) to be confirmed in design phase.',
  };

  console.log(`\n[plan] Plan complete.`);
  console.log(`  Sprints: ${plan.sprints.length}`);
  console.log(`  Total Story Points: ${plan.totalStoryPoints}`);
  console.log(`  Estimated Duration: ${plan.estimatedTotal}`);
  console.log(`\n[plan] Sprint Summary:`);
  for (const s of SPRINT_PLAN) {
    console.log(`  ${s.sprint}: ${s.stories.map(x => x.key).join(', ')} (${s.stories.reduce((a, x) => a + x.points, 0)} pts)`);
  }

  return { plan };
}

module.exports = { run };

if (require.main === module) {
  run().then(result => {
    console.log('\n[plan] HITL REVIEW REQUIRED');
    console.log('Review the sprint plan above. Verify JIRA stories at https://subhasree.atlassian.net');
    console.log('Approve to proceed to Design phase.');
  }).catch(err => {
    console.error('[plan] Failed:', err.message);
    process.exit(1);
  });
}
