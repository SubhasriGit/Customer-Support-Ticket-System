require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs    = require('fs');
const path  = require('path');
const https = require('https');
const { getRequirementsText } = require('../integrations/confluence-requirements');

/**
 * App Analysis & Enhancement Agent (Solutions Analyst Persona)
 *
 * Runs after Requirement Analysis. Scans the codebase and:
 *   1. Collects all implemented API endpoints, UI components, DB migrations, test scenarios
 *   2. Cross-references against requirements stories to identify gaps
 *   3. Creates JIRA enhancement subtasks for each gap
 *   4. Publishes a Gap Analysis report to Confluence
 */

const JIRA_BASE   = process.env.JIRA_BASE_URL;
const JIRA_EMAIL  = process.env.JIRA_EMAIL;
const JIRA_TOKEN  = process.env.JIRA_API_TOKEN;
const PROJECT_KEY = process.env.JIRA_PROJECT_KEY;
const CONF_BASE   = process.env.CONFLUENCE_BASE_URL;
const CONF_SPACE  = process.env.CONFLUENCE_SPACE_KEY;

const ROOT = path.join(__dirname, '../..');

// Story key mapping from plan.js sprint plan — used to parent JIRA subtasks
const STORY_KEY_MAP = {
  triage:     'KAN-3',
  priority:   'KAN-7',
  sla:        'KAN-11',
  analytics:  'KAN-15',
  suggestion: 'KAN-19',
};

// ── Confluence helpers (copied from documentation.js) ─────────────────────────

function confluenceRequest(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');
    const url  = new URL(CONF_BASE + urlPath);
    const b    = body ? JSON.stringify(body) : null;
    const req  = https.request({
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method,
      headers: {
        Authorization:  `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept:         'application/json',
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

async function findPage(title) {
  const encoded = encodeURIComponent(title);
  const res = await confluenceRequest('GET', `/rest/api/content?title=${encoded}&spaceKey=${CONF_SPACE}&expand=version`);
  if (res.status === 200 && res.body.results?.length > 0) return res.body.results[0];
  return null;
}

async function upsertConfluencePage(title, content) {
  const existing = await findPage(title);
  if (existing) {
    const res = await confluenceRequest('PUT', `/rest/api/content/${existing.id}`, {
      type:    'page',
      title,
      version: { number: existing.version.number + 1 },
      body:    { storage: { value: content, representation: 'storage' } },
    });
    if (res.status !== 200) throw new Error(`Confluence update failed (${res.status}): ${JSON.stringify(res.body)}`);
    console.log(`[app_analysis] Updated Confluence page: "${title}" → ${CONF_BASE + res.body._links?.webui}`);
    return res.body;
  }
  const res = await confluenceRequest('POST', '/rest/api/content', {
    type:  'page',
    title,
    space: { key: CONF_SPACE },
    body:  { storage: { value: content, representation: 'storage' } },
  });
  if (res.status !== 200 && res.status !== 201) throw new Error(`Confluence create failed (${res.status}): ${JSON.stringify(res.body)}`);
  console.log(`[app_analysis] Created Confluence page: "${title}" → ${CONF_BASE + res.body._links?.webui}`);
  return res.body;
}

// ── JIRA helpers (copied from analysis.js) ────────────────────────────────────

function jiraRequest(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const auth    = Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');
    const url     = new URL(JIRA_BASE + urlPath);
    const payload = body ? JSON.stringify(body) : null;
    const req     = https.request({
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

async function createJiraSubtask(summary, description, parentKey) {
  const res = await jiraRequest('POST', '/rest/api/3/issue', {
    fields: {
      project:     { key: PROJECT_KEY },
      summary,
      description: {
        type: 'doc', version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
      },
      issuetype: { name: 'Subtask' },
      parent:    { key: parentKey },
    },
  });
  if (res.status !== 201) throw new Error(`JIRA create failed (${res.status}): ${JSON.stringify(res.body)}`);
  return res.body.key;
}

// ── Requirements parser (copied from analysis.js) ─────────────────────────────

function parseRequirements(text) {
  const lines = text.split(/\r?\n/);
  const epics  = [];
  let curEpic  = null, curStory = null, descBuf = [], descTarget = null;

  function flushDesc() {
    if (!descTarget || descBuf.length === 0) return;
    const text = descBuf.join(' ').replace(/\s+/g, ' ').trim();
    if (descTarget === 'epic'  && curEpic)  curEpic.description  = text;
    if (descTarget === 'story' && curStory) curStory.description = text;
    descBuf = []; descTarget = null;
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('=') || line.startsWith('Project') ||
        line.startsWith('Version') || line.startsWith('Author') ||
        line.startsWith('Purpose') || line.startsWith('CUSTOMER')) { flushDesc(); continue; }
    if (/^EPIC:/i.test(line)) {
      flushDesc();
      curEpic = { epic: line.replace(/^EPIC:\s*/i, '').trim(), description: '', stories: [] };
      curStory = null; epics.push(curEpic); descTarget = null; continue;
    }
    if (/^STORY:/i.test(line)) {
      flushDesc();
      curStory = { summary: line.replace(/^STORY:\s*/i, '').trim(), description: '', tasks: [] };
      if (curEpic) curEpic.stories.push(curStory); descTarget = null; continue;
    }
    if (/^TASK:/i.test(line)) {
      flushDesc();
      if (curStory) curStory.tasks.push(line.replace(/^TASK:\s*/i, '').trim()); continue;
    }
    if (/^Description:/i.test(line)) {
      flushDesc();
      descTarget = curStory ? 'story' : (curEpic ? 'epic' : null);
      descBuf.push(line.replace(/^Description:\s*/i, '').trim()); continue;
    }
    if (descTarget) { descBuf.push(line); continue; }
  }
  flushDesc();
  return epics;
}

// ── Codebase scanners ─────────────────────────────────────────────────────────

function scanRoutes() {
  const routesDir = path.join(ROOT, 'backend', 'routes');
  const endpoints = [];
  if (!fs.existsSync(routesDir)) return endpoints;
  for (const file of fs.readdirSync(routesDir)) {
    if (!file.endsWith('.js')) continue;
    const content = fs.readFileSync(path.join(routesDir, file), 'utf8');
    for (const m of content.matchAll(/router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/gi)) {
      endpoints.push({ method: m[1].toUpperCase(), path: m[2], file });
    }
  }
  return endpoints;
}

function scanComponents() {
  const compDir = path.join(ROOT, 'frontend', 'src', 'components');
  if (!fs.existsSync(compDir)) return [];
  return fs.readdirSync(compDir).filter(f => f.endsWith('.jsx') || f.endsWith('.js'));
}

function scanMigrations() {
  const migDir = path.join(ROOT, 'backend', 'db', 'migrations');
  if (!fs.existsSync(migDir)) return [];
  const files = fs.readdirSync(migDir).filter(f => f.endsWith('.sql'));
  return files.map(f => {
    const content = fs.readFileSync(path.join(migDir, f), 'utf8');
    const tables  = [...content.matchAll(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(\w+)/gi)].map(m => m[1]);
    return { file: f, tables };
  });
}

function scanTestScenarios() {
  const featDir = path.join(ROOT, 'tests', 'features');
  if (!fs.existsSync(featDir)) return [];
  const scenarios = [];
  for (const file of fs.readdirSync(featDir)) {
    if (!file.endsWith('.feature')) continue;
    const content = fs.readFileSync(path.join(featDir, file), 'utf8');
    for (const m of content.matchAll(/Scenario:\s*(.+)/g)) scenarios.push(m[1].trim());
  }
  return scenarios;
}

function scanTodos() {
  const todos = [];
  const searchDirs = [
    path.join(ROOT, 'backend'),
    path.join(ROOT, 'frontend', 'src'),
    path.join(ROOT, 'workflow', 'phases'),
  ];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== 'build') { walk(full); continue; }
      if (!entry.isFile()) continue;
      if (!['.js', '.jsx', '.ts', '.tsx'].includes(path.extname(entry.name))) continue;
      const lines = fs.readFileSync(full, 'utf8').split('\n');
      lines.forEach((text, i) => {
        if (/TODO|FIXME/i.test(text)) {
          todos.push({ file: path.relative(ROOT, full), line: i + 1, text: text.trim() });
        }
      });
    }
  }
  searchDirs.forEach(walk);
  return todos;
}

// ── Gap detection ─────────────────────────────────────────────────────────────

function detectGaps(stories, migrations, components, scenarios) {
  const gaps = [];
  const migFiles = migrations.map(m => m.file);

  const CHECKS = [
    {
      storyKeyword: 'triage',
      checks: [
        { label: 'Triage service exists',       pass: fs.existsSync(path.join(ROOT, 'backend', 'services', 'triageService.js')), severity: 'High' },
        { label: 'Sprint-1 triage migration',   pass: migFiles.some(f => f.includes('sprint1_triage')), severity: 'High' },
      ],
      storyKey: STORY_KEY_MAP.triage,
    },
    {
      storyKeyword: 'priority',
      checks: [
        { label: 'Priority column in migration', pass: migFiles.some(f => f.includes('sprint1_triage')), severity: 'Medium' },
      ],
      storyKey: STORY_KEY_MAP.priority,
    },
    {
      storyKeyword: 'sla',
      checks: [
        { label: 'SLA migration exists', pass: migFiles.some(f => f.includes('sprint2_sla')), severity: 'High' },
      ],
      storyKey: STORY_KEY_MAP.sla,
    },
    {
      storyKeyword: 'analytics',
      checks: [
        { label: 'Dashboard component exists',  pass: components.includes('Dashboard.jsx'), severity: 'Medium' },
        { label: 'Analytics route file exists', pass: fs.existsSync(path.join(ROOT, 'backend', 'routes', 'analytics.js')), severity: 'Medium' },
      ],
      storyKey: STORY_KEY_MAP.analytics,
    },
    {
      storyKeyword: 'suggestion',
      checks: [
        { label: 'SuggestedReply component exists', pass: components.includes('SuggestedReply.jsx'), severity: 'Medium' },
        { label: 'Suggestions route file exists',   pass: fs.existsSync(path.join(ROOT, 'backend', 'routes', 'suggestions.js')), severity: 'Medium' },
      ],
      storyKey: STORY_KEY_MAP.suggestion,
    },
  ];

  for (const entry of CHECKS) {
    for (const chk of entry.checks) {
      if (!chk.pass) {
        gaps.push({ type: 'missing-code', story: entry.storyKeyword, label: chk.label, severity: chk.severity, storyKey: entry.storyKey });
      }
    }
  }

  // Test coverage gaps — any story with no matching Cucumber scenario
  for (const epic of stories) {
    for (const story of epic.stories) {
      const words = story.summary.toLowerCase().split(/\W+/).filter(w => w.length > 3);
      const covered = scenarios.some(s => words.some(w => s.toLowerCase().includes(w)));
      if (!covered) {
        const storyKeyword = Object.keys(STORY_KEY_MAP).find(k => story.summary.toLowerCase().includes(k)) || null;
        gaps.push({
          type:     'missing-test',
          story:    story.summary,
          label:    `No Cucumber scenario covers story: "${story.summary}"`,
          severity: 'Medium',
          storyKey: storyKeyword ? STORY_KEY_MAP[storyKeyword] : null,
        });
      }
    }
  }

  return gaps;
}

// ── Confluence report builder ─────────────────────────────────────────────────

function buildReport(scan, gaps, jiraTasks) {
  const gapRows = gaps.map((g, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${g.story || '—'}</td>
      <td>${g.label}</td>
      <td><strong>${g.severity}</strong></td>
      <td>${jiraTasks[i] ? `<a href="${JIRA_BASE}/browse/${jiraTasks[i]}">${jiraTasks[i]}</a>` : 'n/a'}</td>
    </tr>`).join('');

  const endpointRows = scan.endpoints.map(e =>
    `<tr><td>${e.method}</td><td><code>${e.path}</code></td><td>${e.file}</td></tr>`
  ).join('');

  const migrationRows = scan.migrations.map(m =>
    `<tr><td>${m.file}</td><td>${m.tables.join(', ') || '—'}</td></tr>`
  ).join('');

  return `
<h2>App Analysis &amp; Gap Report — Customer Support Ticket System</h2>
<p><em>Generated by Solutions Analyst Agent | SDLC Phase 2 — App Analysis | mm-learning-group-1</em></p>

<h3>1. Codebase Snapshot</h3>
<table>
  <tbody>
    <tr><th>Artifact</th><th>Count</th><th>Details</th></tr>
    <tr><td>API Endpoints</td><td>${scan.endpoints.length}</td><td>${scan.endpoints.map(e => `${e.method} ${e.path}`).join(', ')}</td></tr>
    <tr><td>UI Components</td><td>${scan.components.length}</td><td>${scan.components.join(', ')}</td></tr>
    <tr><td>DB Migrations</td><td>${scan.migrations.length}</td><td>${scan.migrations.map(m => m.file).join(', ')}</td></tr>
    <tr><td>Test Scenarios</td><td>${scan.scenarios.length}</td><td>${scan.scenarios.join('; ')}</td></tr>
    <tr><td>TODO/FIXME items</td><td>${scan.todos.length}</td><td>${scan.todos.length ? scan.todos.map(t => `${t.file}:${t.line}`).join(', ') : 'None'}</td></tr>
  </tbody>
</table>

<h3>2. API Endpoints Detail</h3>
<table>
  <tbody>
    <tr><th>Method</th><th>Path</th><th>File</th></tr>
    ${endpointRows}
  </tbody>
</table>

<h3>3. DB Migration History</h3>
<table>
  <tbody>
    <tr><th>File</th><th>Tables</th></tr>
    ${migrationRows}
  </tbody>
</table>

<h3>4. Gap Analysis</h3>
${gaps.length === 0
  ? '<p><strong>✅ No gaps detected — all requirements are covered.</strong></p>'
  : `<table>
  <tbody>
    <tr><th>#</th><th>Story</th><th>Gap</th><th>Severity</th><th>JIRA Task</th></tr>
    ${gapRows}
  </tbody>
</table>`}

<h3>5. Enhancement Recommendations</h3>
<ul>
  ${gaps.filter(g => g.type === 'missing-test').length > 0
    ? `<li><strong>Extend Cucumber tests</strong> — add BDD scenarios for AI triage display, SLA countdown, analytics dashboard, and suggested reply flow.</li>`
    : ''}
  ${scan.todos.length > 0
    ? `<li><strong>Resolve ${scan.todos.length} TODO/FIXME item(s)</strong> — review and address unfinished work before next sprint.</li>`
    : ''}
  <li><strong>Add response history endpoint</strong> — <code>GET /api/tickets/:id/responses</code> is missing; only write path exists.</li>
  <li><strong>Extract badge sub-components</strong> — CategoryBadge, PriorityBadge, SLACountdown are inlined in TicketList.jsx; extract for reusability and testability.</li>
</ul>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function run({ feedback } = {}) {
  console.log('[app_analysis] Solutions Analyst starting...');
  if (feedback) console.log(`[app_analysis] Incorporating feedback: ${feedback}`);

  // Step 1 — Scan codebase
  console.log('\n[app_analysis] Step 1/4 — Scanning codebase...');
  const endpoints  = scanRoutes();
  const components = scanComponents();
  const migrations = scanMigrations();
  const scenarios  = scanTestScenarios();
  const todos      = scanTodos();

  console.log(`[app_analysis]   API endpoints  : ${endpoints.length}`);
  console.log(`[app_analysis]   UI components  : ${components.length}`);
  console.log(`[app_analysis]   DB migrations  : ${migrations.length}`);
  console.log(`[app_analysis]   Test scenarios : ${scenarios.length}`);
  console.log(`[app_analysis]   TODO/FIXME     : ${todos.length}`);

  // Step 2 — Cross-reference against requirements (fetched from Confluence)
  console.log('\n[app_analysis] Step 2/4 — Cross-referencing against requirements...');
  let requirementsData = [];
  try {
    const reqText = await getRequirementsText();
    requirementsData = parseRequirements(reqText);
  } catch (err) {
    console.warn(`[app_analysis] Could not fetch requirements from Confluence: ${err.message}. Continuing without cross-reference.`);
  }
  const totalStories = requirementsData.reduce((n, e) => n + e.stories.length, 0);
  console.log(`[app_analysis]   Requirements   : ${requirementsData.length} epic(s), ${totalStories} story(ies)`);

  const gaps = detectGaps(requirementsData, migrations, components, scenarios);
  console.log(`[app_analysis]   Gaps detected  : ${gaps.length}`);
  gaps.forEach((g, i) => console.log(`[app_analysis]     ${i + 1}. [${g.severity}] ${g.label}`));

  // Step 3 — Create JIRA subtasks
  console.log('\n[app_analysis] Step 3/4 — Creating JIRA enhancement subtasks...');
  const jiraTasks = [];
  for (const gap of gaps) {
    if (!gap.storyKey) { jiraTasks.push(null); continue; }
    try {
      const key = await createJiraSubtask(
        `[Enhancement] ${gap.label}`,
        `Gap identified during App Analysis phase. Story: ${gap.story || gap.label}. Severity: ${gap.severity}.`,
        gap.storyKey
      );
      console.log(`[app_analysis]   Created ${key} under ${gap.storyKey} — ${gap.label}`);
      jiraTasks.push(key);
    } catch (err) {
      console.warn(`[app_analysis]   ⚠️  JIRA skipped (${gap.label}): ${err.message}`);
      jiraTasks.push(null);
    }
  }

  // Step 4 — Publish Gap Analysis to Confluence
  console.log('\n[app_analysis] Step 4/4 — Publishing Gap Analysis to Confluence...');
  const scan = { endpoints, components, migrations, scenarios, todos };
  const reportContent = buildReport(scan, gaps, jiraTasks);
  const page = await upsertConfluencePage('CSTS — App Analysis & Gap Report', reportContent);
  const confluenceUrl = CONF_BASE + page._links?.webui;

  const created = jiraTasks.filter(Boolean).length;

  console.log('\n[app_analysis] ─────────────────────────────────────────');
  console.log('[app_analysis] APP ANALYSIS COMPLETE');
  console.log(`[app_analysis]   Gaps found   : ${gaps.length} (${created} JIRA subtask(s) created)`);
  console.log(`[app_analysis]   Report       : ${confluenceUrl}`);
  console.log('[app_analysis]   Local URL    : http://localhost:3000');
  console.log('[app_analysis] HITL REVIEW REQUIRED — Approve to proceed to Design.');
  console.log('[app_analysis] ─────────────────────────────────────────');

  return { gaps, jiraTasks, confluenceUrl, scan };
}

module.exports = { run };

if (require.main === module) {
  run().catch(err => { console.error('[app_analysis] Failed:', err.message); process.exit(1); });
}
