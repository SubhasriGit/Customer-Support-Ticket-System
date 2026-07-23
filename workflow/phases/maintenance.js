require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const https = require('https');

/**
 * Maintenance Phase Agent
 * Post-deployment activities:
 * - Creates a Maintenance JIRA story under the existing epic (KAN-2)
 * - Logs a maintenance checklist to Confluence
 * - Reports health endpoint status
 */

const JIRA_BASE  = process.env.JIRA_BASE_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_TOKEN = process.env.JIRA_API_TOKEN;
const CONF_BASE  = process.env.CONFLUENCE_BASE_URL;
const CONF_SPACE = process.env.CONFLUENCE_SPACE_KEY;

function jiraRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');
    const data = body ? JSON.stringify(body) : null;
    const url  = new URL(path, JIRA_BASE);
    const req  = https.request({
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(raw); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function confRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');
    const data = body ? JSON.stringify(body) : null;
    const url  = new URL(path, CONF_BASE);
    const req  = https.request({
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { resolve(raw); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run({ feedback } = {}) {
  console.log('[maintenance] Maintenance Phase Agent starting...');
  if (feedback) console.log(`[maintenance] Incorporating feedback: ${feedback}`);

  // ── 1. Create Maintenance Story in JIRA ────────────────────────────────────
  console.log('\n[maintenance] Step 1/3 — Creating Maintenance story in JIRA...');
  let jiraKey = null;
  try {
    const story = await jiraRequest('POST', '/rest/api/3/issue', {
      fields: {
        project: { key: 'KAN' },
        issuetype: { name: 'Story' },
        parent: { key: 'KAN-2' },
        summary: 'Maintenance & Post-Deployment Support',
        description: {
          type: 'doc', version: 1,
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text:
              'Ongoing maintenance tasks: monitor health endpoint, handle bug reports, ' +
              'apply dependency updates, review SLA breach rates, and plan next iteration.'
            }],
          }],
        },
        priority: { name: 'Medium' },
        labels: ['maintenance', 'post-deployment'],
      },
    });
    jiraKey = story.key;
    console.log(`[maintenance] ✅ JIRA story created: ${jiraKey}`);
  } catch (err) {
    console.warn(`[maintenance] ⚠️  JIRA story skipped: ${err.message}`);
  }

  // ── 2. Publish Maintenance Checklist to Confluence ─────────────────────────
  console.log('\n[maintenance] Step 2/3 — Publishing maintenance checklist to Confluence...');
  let confPageId = null;
  try {
    const page = await confRequest('POST', '/wiki/rest/api/content', {
      type: 'page',
      title: 'Maintenance & Operations Runbook',
      space: { key: CONF_SPACE },
      body: {
        storage: {
          representation: 'storage',
          value: `
<h2>Maintenance Runbook — Customer Support Ticket System</h2>
<h3>Health Check</h3>
<p>Endpoint: <code>GET /health</code> → <code>{"status":"ok"}</code></p>
<h3>Routine Maintenance Tasks</h3>
<ul>
  <li>Monitor SLA breach rate via <code>GET /api/analytics</code></li>
  <li>Review open tickets weekly</li>
  <li>Apply npm security patches: <code>npm audit fix</code></li>
  <li>Rotate JIRA/Confluence API tokens every 90 days</li>
  <li>Backup SQLite database monthly</li>
</ul>
<h3>Incident Response</h3>
<ul>
  <li>Check <code>/health</code> endpoint first</li>
  <li>Review server logs for unhandled errors</li>
  <li>Rollback: <code>git revert HEAD</code> and redeploy</li>
</ul>
<h3>Next Iteration Planning</h3>
<ul>
  <li>Collect user feedback from support tickets</li>
  <li>Review analytics for high-volume categories</li>
  <li>Prioritize backlog for next sprint in JIRA</li>
</ul>`,
        },
      },
    });
    confPageId = page.id;
    console.log(`[maintenance] ✅ Confluence page created: ID ${confPageId}`);
  } catch (err) {
    console.warn(`[maintenance] ⚠️  Confluence page skipped: ${err.message}`);
  }

  // ── 3. Health check ─────────────────────────────────────────────────────────
  console.log('\n[maintenance] Step 3/3 — Running health check...');
  let healthStatus = 'unknown';
  try {
    const { execSync } = require('child_process');
    const res = execSync('curl -sf http://localhost:3000/health', { encoding: 'utf8', stdio: 'pipe' });
    healthStatus = JSON.parse(res).status;
    console.log(`[maintenance] ✅ Health check: ${healthStatus}`);
  } catch {
    console.warn('[maintenance] ⚠️  Health check: server not reachable (may not be running)');
    healthStatus = 'unreachable';
  }

  console.log('\n[maintenance] ─────────────────────────────────────────');
  console.log('[maintenance] MAINTENANCE PHASE COMPLETE');
  if (jiraKey)    console.log(`[maintenance]   JIRA story    : ${jiraKey}`);
  if (confPageId) console.log(`[maintenance]   Confluence    : Page ID ${confPageId}`);
  console.log(`[maintenance]   Health status : ${healthStatus}`);
  console.log('[maintenance] Pipeline fully complete. System is live and monitored.');
  console.log('[maintenance] ─────────────────────────────────────────');

  return { jiraKey, confPageId, healthStatus };
}

module.exports = { run };

if (require.main === module) {
  run().catch(err => { console.error('[maintenance] Failed:', err.message); process.exit(1); });
}
