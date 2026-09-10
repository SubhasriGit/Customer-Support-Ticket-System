require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const https = require('https');
const path  = require('path');
const { getRequirementsText } = require('../integrations/confluence-requirements');

/**
 * Requirement Analysis Phase Agent (BA Persona)
 *
 * Reads plain-English requirements from the Confluence page whose URL
 * is stored in requirements/Enhancement.txt, then parses the structured
 * sections (EPIC / STORY / TASK) and creates the corresponding JIRA
 * hierarchy: Epic → Story → Subtask.
 */

const JIRA_BASE   = process.env.JIRA_BASE_URL;
const JIRA_EMAIL  = process.env.JIRA_EMAIL;
const JIRA_TOKEN  = process.env.JIRA_API_TOKEN;
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY;

// ── JIRA helper ────────────────────────────────────────────────────────────────
function jiraRequest(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const auth    = Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');
    const url     = new URL(JIRA_BASE + urlPath);
    const payload = body ? JSON.stringify(body) : null;

    const req = https.request({
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method,
      headers: {
        Authorization:  `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept:         'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function createJiraIssue({ summary, description, issueType, parentKey = null }) {
  const body = {
    fields: {
      project:     { key: PROJECT_KEY },
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
  if (res.status !== 201) throw new Error(`JIRA create failed (${res.status}): ${JSON.stringify(res.body)}`);
  console.log(`[analysis] Created ${issueType}: ${res.body.key} — ${summary}`);
  return res.body.key;
}

// ── Requirements parser ────────────────────────────────────────────────────────
/**
 * Parses a requirements text string into a structured array:
 * [
 *   {
 *     epic: 'Title',
 *     description: 'text...',
 *     stories: [
 *       { summary: 'Title', description: 'text...', tasks: ['Task 1', 'Task 2'] }
 *     ]
 *   }
 * ]
 */
function parseRequirements(text) {
  const lines = text.split(/\r?\n/);
  const epics = [];
  let curEpic = null;
  let curStory = null;
  let steps = [];

  // Group by numbered features as epics
  for (const raw of lines) {
    const line = raw.trim();
    // Epic heading: numbered list
    const epicMatch = line.match(/^\d+\.\s*(.+?)(?:\s*\(.+\))?$/);
    if (epicMatch) {
      // Flush previous story
      if (curStory && curEpic) {
        curStory.tasks = steps.slice();
        curEpic.stories.push(curStory);
      }
      // Flush previous epic
      if (curEpic) {
        epics.push(curEpic);
      }
      // Start new epic
      curEpic = { epic: epicMatch[1].trim(), description: '', stories: [] };
      curStory = null;
      steps = [];
      continue;
    }
    // Story from Gherkin Scenario
    const storyMatch = line.match(/^Scenario(?: Outline)?:\s*(.+)$/i);
    if (storyMatch && curEpic) {
      // Flush previous story
      if (curStory) {
        curStory.tasks = steps.slice();
        curEpic.stories.push(curStory);
      }
      curStory = { summary: storyMatch[1].trim(), description: '', tasks: [] };
      steps = [];
      continue;
    }
    // Task: Given/When/Then/And lines
    if (curStory && /^(Given|When|Then|And)\b/i.test(line)) {
      steps.push(line);
      continue;
    }
  }
  // Flush last story and epic
  if (curStory && curEpic) {
    curStory.tasks = steps.slice();
    curEpic.stories.push(curStory);
  }
  if (curEpic) {
    epics.push(curEpic);
  }
  return epics;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function run({ feedback } = {}) {
  console.log('[analysis] BA Agent starting...');
  if (feedback) console.log(`[analysis] Incorporating feedback: ${feedback}`);

  // Read requirements from Confluence (URL stored in requirements/Enhancement.txt)
  const requirementsText = await getRequirementsText();
  const enhancements = parseRequirements(requirementsText);
  console.log(`[analysis] Parsed ${enhancements.length} epic(s) from Confluence requirements page`);

  const output = { epics: [], stories: [], tasks: [] };

  for (const group of enhancements) {
    const epicKey = await createJiraIssue({
      summary:     group.epic,
      description: group.description || `EPIC: ${group.epic}. ${feedback || ''}`,
      issueType:   'Epic',
    });
    output.epics.push(epicKey);

    for (const story of group.stories) {
      const storyKey = await createJiraIssue({
        summary:     story.summary,
        description: story.description ||
          `As a support team member, I want to ${story.summary.toLowerCase()} so that I can serve customers more efficiently.`,
        issueType:   'Story',
        parentKey:   epicKey,
      });
      output.stories.push(storyKey);

      for (const taskSummary of story.tasks) {
        const taskKey = await createJiraIssue({
          summary:     taskSummary,
          description: `Subtask under story ${storyKey}: ${taskSummary}`,
          issueType:   'Subtask',
          parentKey:   storyKey,
        });
        output.tasks.push(taskKey);
      }
    }
  }

  console.log(`\n[analysis] Done. Created ${output.epics.length} epic(s), ${output.stories.length} story(ies), ${output.tasks.length} subtask(s).`);
  return output;
}

module.exports = { run };

if (require.main === module) {
  run().catch(err => { console.error('[analysis] Failed:', err.message); process.exit(1); });
}
