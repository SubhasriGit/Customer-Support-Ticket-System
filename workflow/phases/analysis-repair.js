// Repair script: completes stories 2-5 and all subtasks under existing KAN-2 epic.
// Run once after the initial analysis.js run which stopped at KAN-3.
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const https = require('https');

const JIRA_BASE = process.env.JIRA_BASE_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_TOKEN = process.env.JIRA_API_TOKEN;
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY;

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

async function createIssue({ summary, description, issueType, parentKey }) {
  const body = {
    fields: {
      project: { key: PROJECT_KEY },
      summary,
      description: {
        type: 'doc', version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
      },
      issuetype: { name: issueType },
      ...(parentKey ? { parent: { key: parentKey } } : {}),
    },
  };
  const res = await jiraRequest('POST', '/rest/api/3/issue', body);
  if (res.status !== 201) {
    console.error(`  FAILED (${issueType}): ${summary}`);
    console.error(`  Error: ${JSON.stringify(res.body)}`);
    return null;
  }
  console.log(`  Created ${issueType} ${res.body.key}: ${summary}`);
  return res.body.key;
}

// Stories 2-5 (KAN-3 already exists as Story 1 under KAN-2)
const REMAINING_STORIES = [
  { summary: 'Priority and severity scoring', tasks: ['Design scoring algorithm', 'Add priority field to API', 'Show priority badge in UI'] },
  { summary: 'SLA tracking and breach alerts', tasks: ['Define SLA rules per priority', 'Implement SLA countdown timer', 'Send alert on SLA breach'] },
  { summary: 'Analytics dashboard', tasks: ['Design dashboard wireframe', 'Build ticket volume chart', 'Build resolution time metrics'] },
  { summary: 'Auto-response suggestions', tasks: ['Integrate Claude API for response drafts', 'Add response suggestion panel to agent view', 'Allow agent to accept/edit suggestions'] },
];

// KAN-3 already exists — just need its subtasks
const STORY1_KAN3_TASKS = ['Implement NLP category classifier', 'Add category field to ticket schema', 'Display category in ticket list'];

const EPIC_KEY = 'KAN-2';
const STORY1_KEY = 'KAN-3';

async function main() {
  console.log(`\nRepair: completing JIRA hierarchy under epic ${EPIC_KEY}\n`);

  // Step 1: Create subtasks under KAN-3 (Story 1 that already exists)
  console.log(`Creating subtasks for existing Story ${STORY1_KEY}:`);
  for (const t of STORY1_KAN3_TASKS) {
    await createIssue({ summary: t, description: `Subtask: ${t}`, issueType: 'Subtask', parentKey: STORY1_KEY });
  }

  // Step 2: Create remaining stories + their subtasks under KAN-2
  for (const story of REMAINING_STORIES) {
    console.log(`\nCreating Story under ${EPIC_KEY}: ${story.summary}`);
    const storyKey = await createIssue({
      summary: story.summary,
      description: `User Story: As a support team member, I want to ${story.summary.toLowerCase()} so that customers are served more efficiently.`,
      issueType: 'Story',
      parentKey: EPIC_KEY,
    });
    if (!storyKey) continue;
    for (const t of story.tasks) {
      await createIssue({ summary: t, description: `Subtask: ${t}`, issueType: 'Subtask', parentKey: storyKey });
    }
  }

  console.log('\nRepair complete. Check https://subhasree.atlassian.net/jira/software/projects/KAN/boards\n');
}

main().catch(err => console.error('Fatal:', err.message));
