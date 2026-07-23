require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const https = require('https');

/**
 * Analysis Phase Agent (BA Persona)
 * - Uses CodeMie/Claude MCP to analyze the base app
 * - Identifies gaps and enhancement opportunities
 * - Creates JIRA EPICs, Stories, and Tasks
 */

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

async function createJiraIssue({ summary, description, issueType, parentKey = null }) {
  const body = {
    fields: {
      project: { key: PROJECT_KEY },
      summary,
      description: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }] },
      issuetype: { name: issueType },
      ...(parentKey ? { parent: { key: parentKey } } : {}),
    },
  };
  const res = await jiraRequest('POST', '/rest/api/3/issue', body);
  if (res.status !== 201) throw new Error(`JIRA create failed: ${JSON.stringify(res.body)}`);
  console.log(`[analysis] Created JIRA ${issueType}: ${res.body.key} — ${summary}`);
  return res.body.key;
}

// Enhancements identified by the BA AI assistant for a basic ticket system
const ENHANCEMENTS = [
  {
    epic: 'AI-Enhanced Customer Support System',
    stories: [
      { summary: 'AI-powered ticket triage and categorisation', tasks: ['Implement NLP category classifier', 'Add category field to ticket schema', 'Display category in ticket list'] },
      { summary: 'Priority and severity scoring', tasks: ['Design scoring algorithm', 'Add priority field to API', 'Show priority badge in UI'] },
      { summary: 'SLA tracking and breach alerts', tasks: ['Define SLA rules per priority', 'Implement SLA countdown timer', 'Send alert on SLA breach'] },
      { summary: 'Analytics dashboard', tasks: ['Design dashboard wireframe', 'Build ticket volume chart', 'Build resolution time metrics'] },
      { summary: 'Auto-response suggestions', tasks: ['Integrate Claude API for response drafts', 'Add response suggestion panel to agent view', 'Allow agent to accept/edit suggestions'] },
    ],
  },
];

async function run({ feedback } = {}) {
  console.log('[analysis] BA Agent starting...');
  if (feedback) console.log(`[analysis] Incorporating feedback: ${feedback}`);

  const output = { epics: [], stories: [], tasks: [] };

  for (const group of ENHANCEMENTS) {
    const epicKey = await createJiraIssue({
      summary: group.epic,
      description: `EPIC created by AI BA Agent for the AI-driven SDLC capstone project. ${feedback || ''}`,
      issueType: 'Epic',
    });
    output.epics.push(epicKey);

    for (const story of group.stories) {
      const storyKey = await createJiraIssue({
        summary: story.summary,
        description: `User Story: As a support team member, I want to ${story.summary.toLowerCase()} so that I can serve customers more efficiently.`,
        issueType: 'Story',
        parentKey: epicKey,
      });
      output.stories.push(storyKey);

      for (const taskSummary of story.tasks) {
        const taskKey = await createJiraIssue({
          summary: taskSummary,
          description: `Task under story ${storyKey}: ${taskSummary}`,
          issueType: 'Subtask',
          parentKey: storyKey,
        });
        output.tasks.push(taskKey);
      }
    }
  }

  console.log(`[analysis] Done. Created ${output.epics.length} epic(s), ${output.stories.length} story(ies), ${output.tasks.length} task(s).`);
  return output;
}

module.exports = { run };
