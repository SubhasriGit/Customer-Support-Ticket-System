require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const https = require('https');
const fs    = require('fs');
const path  = require('path');

/**
 * Requirement Analysis Phase Agent (BA Persona)
 *
 * Reads plain-English requirements from:
 *   requirements/requirements.txt
 *
 * Parses the structured sections (EPIC / STORY / TASK) and creates
 * the corresponding JIRA hierarchy: Epic → Story → Subtask.
 *
 * Requirements file format:
 *   EPIC: <title>
 *   Description: <text>
 *
 *     STORY: <title>
 *     Description: <text>
 *       TASK: <title>
 *       TASK: <title>
 */

const JIRA_BASE   = process.env.JIRA_BASE_URL;
const JIRA_EMAIL  = process.env.JIRA_EMAIL;
const JIRA_TOKEN  = process.env.JIRA_API_TOKEN;
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY;

const REQUIREMENTS_FILE = path.join(__dirname, '../../requirements/requirements.txt');

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
 * Parses requirements.txt into a structured array:
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
function parseRequirements(filePath) {
  const raw   = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);

  const epics   = [];
  let curEpic   = null;
  let curStory  = null;
  let descBuf   = [];         // accumulates Description: continuation lines
  let descTarget = null;      // 'epic' | 'story' | null

  function flushDesc() {
    if (!descTarget || descBuf.length === 0) return;
    const text = descBuf.join(' ').replace(/\s+/g, ' ').trim();
    if (descTarget === 'epic'  && curEpic)  curEpic.description  = text;
    if (descTarget === 'story' && curStory) curStory.description = text;
    descBuf    = [];
    descTarget = null;
  }

  for (const raw of lines) {
    const line = raw.trim();

    // Skip header / separator / blank lines that are not part of a description
    if (!line || line.startsWith('=') || line.startsWith('Project') ||
        line.startsWith('Version') || line.startsWith('Author') ||
        line.startsWith('Purpose') || line.startsWith('CUSTOMER')) {
      flushDesc();
      continue;
    }

    // EPIC:
    if (/^EPIC:/i.test(line)) {
      flushDesc();
      curEpic  = { epic: line.replace(/^EPIC:\s*/i, '').trim(), description: '', stories: [] };
      curStory = null;
      epics.push(curEpic);
      descTarget = null;
      continue;
    }

    // STORY:
    if (/^STORY:/i.test(line)) {
      flushDesc();
      curStory = { summary: line.replace(/^STORY:\s*/i, '').trim(), description: '', tasks: [] };
      if (curEpic) curEpic.stories.push(curStory);
      descTarget = null;
      continue;
    }

    // TASK:
    if (/^TASK:/i.test(line)) {
      flushDesc();
      const taskTitle = line.replace(/^TASK:\s*/i, '').trim();
      if (curStory) curStory.tasks.push(taskTitle);
      continue;
    }

    // Description: (first line)
    if (/^Description:/i.test(line)) {
      flushDesc();
      descTarget = curStory ? 'story' : (curEpic ? 'epic' : null);
      descBuf.push(line.replace(/^Description:\s*/i, '').trim());
      continue;
    }

    // Continuation of a description block (indented or plain text after Description:)
    if (descTarget) {
      descBuf.push(line);
      continue;
    }
  }

  flushDesc();
  return epics;
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function run({ feedback } = {}) {
  console.log('[analysis] BA Agent starting...');
  if (feedback) console.log(`[analysis] Incorporating feedback: ${feedback}`);

  // Read and parse requirements
  if (!fs.existsSync(REQUIREMENTS_FILE)) {
    throw new Error(`Requirements file not found: ${REQUIREMENTS_FILE}`);
  }

  console.log(`[analysis] Reading requirements from: ${REQUIREMENTS_FILE}`);
  const enhancements = parseRequirements(REQUIREMENTS_FILE);
  console.log(`[analysis] Parsed ${enhancements.length} epic(s) from requirements.txt`);

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
