require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const https  = require('https');
const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const { execSync } = require('child_process');

/**
 * Pre-Pipeline Checklist
 * Verifies all systems are ready before running the SDLC pipeline.
 *
 * Usage: node workflow/checklist.js
 */

const ROOT = path.join(__dirname, '..');

// ── Colour helpers ─────────────────────────────────────────────────────────────
const GREEN  = s => `\x1b[32m${s}\x1b[0m`;
const RED    = s => `\x1b[31m${s}\x1b[0m`;
const YELLOW = s => `\x1b[33m${s}\x1b[0m`;
const BOLD   = s => `\x1b[1m${s}\x1b[0m`;
const TICK   = GREEN('✔');
const CROSS  = RED('✘');
const WARN   = YELLOW('⚠');

const results = [];

function record(label, passed, detail = '') {
  results.push({ label, passed, detail });
  const icon   = passed === true ? TICK : passed === 'warn' ? WARN : CROSS;
  const status = passed === true ? GREEN('PASS') : passed === 'warn' ? YELLOW('WARN') : RED('FAIL');
  console.log(`  ${icon}  ${status}  ${label}${detail ? '  — ' + detail : ''}`);
}

function httpGet(url) {
  return new Promise(resolve => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 8000 }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', err => resolve({ status: 0, body: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
  });
}

function apiRequest(url, token, authType = 'Bearer') {
  return new Promise(resolve => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        Authorization: `${authType} ${token}`,
        Accept: 'application/json',
        'User-Agent': 'CSTS-Checklist',
      },
      timeout: 8000,
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', err => resolve({ status: 0, body: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
    req.end();
  });
}

// ── 1. Requirements ────────────────────────────────────────────────────────────
async function checkRequirements() {
  console.log(BOLD('\n[1] Requirements'));

  const reqFile = path.join(ROOT, 'requirements', 'requirements.txt');
  if (!fs.existsSync(reqFile)) {
    record('requirements/requirements.txt exists', false, 'File not found');
    return;
  }
  record('requirements/requirements.txt exists', true);

  const content = fs.readFileSync(reqFile, 'utf8');
  const epicCount  = (content.match(/^EPIC:/gim)  || []).length;
  const storyCount = (content.match(/^\s+STORY:/gim) || []).length;
  const taskCount  = (content.match(/^\s+TASK:/gim)  || []).length;

  if (epicCount === 0) {
    record('Requirements contain at least one EPIC', false, 'No EPIC: sections found');
  } else {
    record('Requirements contain at least one EPIC', true, `${epicCount} epic(s), ${storyCount} story(ies), ${taskCount} task(s)`);
  }
}

// ── 2. JIRA & Confluence connections ──────────────────────────────────────────
async function checkJiraConnections() {
  console.log(BOLD('\n[2] JIRA & Confluence Connections'));

  const jiraBase  = process.env.JIRA_BASE_URL;
  const jiraEmail = process.env.JIRA_EMAIL;
  const jiraToken = process.env.JIRA_API_TOKEN;
  const projKey   = process.env.JIRA_PROJECT_KEY;
  const confBase  = process.env.CONFLUENCE_BASE_URL;
  const confSpace = process.env.CONFLUENCE_SPACE_KEY;

  // Env vars
  if (!jiraBase || !jiraEmail || !jiraToken || !projKey) {
    record('JIRA env vars set', false, 'Missing: ' + ['JIRA_BASE_URL','JIRA_EMAIL','JIRA_API_TOKEN','JIRA_PROJECT_KEY'].filter(k => !process.env[k]).join(', '));
  } else {
    record('JIRA env vars set', true);
  }

  if (!confBase || !confSpace) {
    record('Confluence env vars set', false, 'Missing: ' + ['CONFLUENCE_BASE_URL','CONFLUENCE_SPACE_KEY'].filter(k => !process.env[k]).join(', '));
  } else {
    record('Confluence env vars set', true);
  }

  // Live JIRA ping
  if (jiraBase && jiraToken && jiraEmail) {
    const auth = Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64');
    const res  = await apiRequest(`${jiraBase}/rest/api/3/project/${projKey}`, auth, 'Basic');
    if (res.status === 200) {
      record('JIRA API reachable', true, `Project ${projKey} found`);
    } else {
      record('JIRA API reachable', false, `HTTP ${res.status}`);
    }
  }

  // Live Confluence ping
  if (confBase && jiraToken && jiraEmail) {
    const auth = Buffer.from(`${jiraEmail}:${jiraToken}`).toString('base64');
    const res  = await apiRequest(`${confBase}/rest/api/space/${confSpace}`, auth, 'Basic');
    if (res.status === 200) {
      record('Confluence API reachable', true, `Space ${confSpace} found`);
    } else {
      record('Confluence API reachable', false, `HTTP ${res.status}`);
    }
  }

  // GitHub
  const ghOwner = process.env.GITHUB_OWNER;
  const ghRepo  = process.env.GITHUB_REPO;
  const ghPat   = process.env.GITHUB_PAT;

  if (!ghOwner || !ghRepo || !ghPat) {
    record('GitHub env vars set', false, 'Missing: ' + ['GITHUB_OWNER','GITHUB_REPO','GITHUB_PAT'].filter(k => !process.env[k]).join(', '));
  } else {
    const res = await apiRequest(`https://api.github.com/repos/${ghOwner}/${ghRepo}`, ghPat);
    if (res.status === 200) {
      record('GitHub API reachable', true, `${ghOwner}/${ghRepo}`);
    } else {
      record('GitHub API reachable', false, `HTTP ${res.status}`);
    }
  }
}

// ── 3. Development code stability ─────────────────────────────────────────────
async function checkDevelopment() {
  console.log(BOLD('\n[3] Development Code Stability'));

  // Backend entry point
  const serverJs = path.join(ROOT, 'backend', 'server.js');
  record('backend/server.js exists', fs.existsSync(serverJs));

  // Backend syntax check
  try {
    execSync(`node --check "${serverJs}"`, { stdio: 'pipe' });
    record('Backend syntax valid', true);
  } catch (e) {
    record('Backend syntax valid', false, e.stderr?.toString().trim());
  }

  // Backend node_modules
  const backendModules = path.join(ROOT, 'backend', 'node_modules');
  record('Backend dependencies installed', fs.existsSync(backendModules), fs.existsSync(backendModules) ? '' : 'Run: cd backend && npm install');

  // Frontend build
  const frontendBuild = path.join(ROOT, 'frontend', 'build', 'index.html');
  if (fs.existsSync(frontendBuild)) {
    record('Frontend build exists', true, 'frontend/build/index.html');
  } else {
    record('Frontend build exists', 'warn', 'Run: cd frontend && npm run build');
  }

  // DB migrations
  const migrationsDir = path.join(ROOT, 'backend', 'db', 'migrations');
  const migrations = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'))
    : [];
  record('DB migrations present', migrations.length > 0, `${migrations.length} migration file(s)`);
}

// ── 4. QA Automation ──────────────────────────────────────────────────────────
async function checkQA() {
  console.log(BOLD('\n[4] QA Automation'));

  const specFile  = path.join(ROOT, 'tests', 'specs', 'tickets.spec.js');
  const configFile = path.join(ROOT, 'tests', 'playwright.config.js');
  const testModules = path.join(ROOT, 'tests', 'node_modules');

  record('Playwright spec file exists', fs.existsSync(specFile), 'tests/specs/tickets.spec.js');
  record('Playwright config exists',    fs.existsSync(configFile), 'tests/playwright.config.js');
  record('Test dependencies installed', fs.existsSync(testModules), fs.existsSync(testModules) ? '' : 'Run: cd tests && npm install');

  // Check Chromium is installed
  try {
    execSync('npx playwright --version', { cwd: path.join(ROOT, 'tests'), stdio: 'pipe' });
    record('Playwright CLI available', true);
  } catch {
    record('Playwright CLI available', false, 'Run: cd tests && npx playwright install chromium');
  }

  // Run tests if server is up
  const serverUp = (await httpGet('http://localhost:3000/health')).status === 200;
  if (serverUp) {
    console.log(`  ${YELLOW('›')}  Server is running — executing Playwright tests...`);
    try {
      const out = execSync('npx playwright test --reporter=list', {
        cwd: path.join(ROOT, 'tests'),
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 60000,
      });
      const passed = (out.match(/(\d+) passed/) || [])[1] || '?';
      const total  = (out.match(/Running (\d+) tests/) || [])[1] || '?';
      record('Playwright tests pass', true, `${passed}/${total} tests passed`);
    } catch (e) {
      const out = (e.stdout || '') + (e.stderr || '');
      const failed = (out.match(/(\d+) failed/) || [])[1] || '?';
      record('Playwright tests pass', false, `${failed} test(s) failed — run: cd tests && npx playwright test`);
    }
  } else {
    record('Playwright tests pass', 'warn', 'Server not running — start server first, then re-run checklist');
  }
}

// ── 5. Deployment ─────────────────────────────────────────────────────────────
async function checkDeployment() {
  console.log(BOLD('\n[5] Deployment'));

  // render.yaml
  const renderYaml = path.join(ROOT, 'render.yaml');
  record('render.yaml present', fs.existsSync(renderYaml), 'Required for Render.com deploy');

  // CI workflow
  const ciYml = path.join(ROOT, '.github', 'workflows', 'ci.yml');
  record('GitHub Actions CI workflow', fs.existsSync(ciYml), '.github/workflows/ci.yml');

  // Local URL
  const localHealth = await httpGet('http://localhost:3000/health');
  if (localHealth.status === 200) {
    record('Application reachable locally', true, 'http://localhost:3000');
  } else {
    record('Application reachable locally', 'warn', 'Server not running — run: cd backend && PORT=3000 node server.js');
  }

  // Render / production URL
  const renderUrl = process.env.RENDER_URL;
  if (renderUrl) {
    const res = await httpGet(`${renderUrl}/health`);
    if (res.status === 200) {
      record('Production URL reachable', true, renderUrl);
    } else {
      record('Production URL reachable', false, `${renderUrl} returned HTTP ${res.status}`);
    }
  } else {
    record('Production URL configured', 'warn', 'Set RENDER_URL=https://your-app.onrender.com in .env after deploying');
  }
}

// ── Summary ────────────────────────────────────────────────────────────────────
function printSummary() {
  const passed = results.filter(r => r.passed === true).length;
  const warned = results.filter(r => r.passed === 'warn').length;
  const failed = results.filter(r => r.passed === false).length;
  const total  = results.length;

  console.log('\n' + '═'.repeat(55));
  console.log(BOLD('  CHECKLIST SUMMARY'));
  console.log('═'.repeat(55));
  console.log(`  ${TICK}  Passed  : ${passed}/${total}`);
  if (warned) console.log(`  ${WARN}  Warnings: ${warned}`);
  if (failed) console.log(`  ${CROSS}  Failed  : ${failed}`);

  if (failed === 0 && warned === 0) {
    console.log(GREEN('\n  ✅  All checks passed — pipeline is ready to run.\n'));
  } else if (failed === 0) {
    console.log(YELLOW('\n  ⚠   Pipeline can run but review warnings above.\n'));
  } else {
    console.log(RED('\n  ❌  Fix the failed checks before running the pipeline.\n'));
    console.log('  Failed items:');
    results.filter(r => r.passed === false).forEach(r => {
      console.log(`    ${CROSS}  ${r.label}${r.detail ? ' — ' + r.detail : ''}`);
    });
    console.log('');
  }

  return failed === 0;
}

// ── Run all checks ─────────────────────────────────────────────────────────────
async function main() {
  console.log('═'.repeat(55));
  console.log(BOLD('  CUSTOMER SUPPORT TICKET SYSTEM — PRE-PIPELINE CHECKLIST'));
  console.log('═'.repeat(55));

  await checkRequirements();
  await checkJiraConnections();
  await checkDevelopment();
  await checkQA();
  await checkDeployment();

  const allPassed = printSummary();
  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error(RED('Checklist error: ' + err.message));
  process.exit(1);
});
