require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { execSync, spawn, spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * QA Phase Agent (Playwright E2E)
 * - Starts backend (serves frontend build + API) on port 3000
 * - Runs Playwright test suite with self-healing selectors
 * - Reports results for HITL review
 */

const ROOT    = path.join(__dirname, '../..');
const BACKEND = path.join(ROOT, 'backend');
const TESTS   = path.join(ROOT, 'tests');

const CUCUMBER_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Streams Cucumber output to the terminal in real-time while also capturing it.
function runCucumber(cwd, timeoutMs = CUCUMBER_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['cucumber-js', '--config', 'cucumber.js'], {
      cwd,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Cucumber timed out after ${timeoutMs / 60000} minutes`));
    }, timeoutMs);

    proc.stdout.on('data', chunk => { output += chunk; process.stdout.write(chunk); });
    proc.stderr.on('data', chunk => { output += chunk; process.stderr.write(chunk); });

    proc.on('close', code => {
      clearTimeout(timer);
      resolve({ output, exitCode: code || 0 });
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function waitForPort(port, maxMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      execSync(`curl -sf http://localhost:${port}/health`, { stdio: 'pipe' });
      return true;
    } catch {
      execSync('timeout /t 1 /nobreak >nul 2>&1 || sleep 1', { stdio: 'ignore', shell: true });
    }
  }
  return false;
}

async function run({ feedback } = {}) {
  console.log('[qa] QA Agent starting...');
  if (feedback) console.log(`[qa] Incorporating feedback: ${feedback}`);

  // ── 1. Start backend (serves frontend build + API on port 3000) ────────────
  const port = process.env.PORT || '3001';
  console.log(`\n[qa] Step 1/3 — Starting server on port ${port}...`);
  let serverProc = null;
  const alreadyUp = (() => {
    try { execSync(`curl -sf http://localhost:${port}/health`, { stdio: 'pipe' }); return true; } catch { return false; }
  })();

  if (alreadyUp) {
    console.log(`[qa] Server already running on port ${port}.`);
  } else {
    serverProc = spawn('node', ['server.js'], {
      cwd: BACKEND,
      env: { ...process.env, PORT: port },
      detached: false,
      stdio: 'inherit',
    });
    console.log('[qa] Waiting for server to be ready...');
    if (!waitForPort(parseInt(port))) throw new Error(`Server did not start within 30s`);
    console.log(`[qa] ✅ Server ready at http://localhost:${port}`);
  }

  try {
    // ── 2. Run Cucumber BDD tests ───────────────────────────────────────────
    console.log('\n[qa] Step 2/3 — Running Cucumber BDD tests...');

    const { output, exitCode } = await runCucumber(TESTS);

    console.log('\n[qa] --- Cucumber output ---');
    console.log(output.trim());
    console.log('[qa] --- end ---\n');

    // Generate HTML report from Cucumber JSON
    try {
      execSync('node cucumber-report/generate.js', { cwd: TESTS, stdio: 'pipe' });
    } catch { /* non-fatal */ }

    // ── 3. Parse results ─────────────────────────────────────────────────────
    console.log('\n[qa] Step 3/3 — Parsing results...');
    const scenarioMatch = output.match(/(\d+) scenarios? \(([^)]+)\)/);
    const stepMatch     = output.match(/(\d+) steps? \(([^)]+)\)/);
    const passedScen    = scenarioMatch ? (scenarioMatch[2].match(/(\d+) passed/) || [])[1] || '0' : '0';
    const failedScen    = scenarioMatch ? (scenarioMatch[2].match(/(\d+) failed/) || [])[1] || '0' : '0';
    const totalScen     = scenarioMatch ? parseInt(scenarioMatch[1]) : 0;
    const passedSteps   = stepMatch     ? (stepMatch[2].match(/(\d+) passed/)     || [])[1] || '0' : '0';
    const healLog = path.join(ROOT, 'workflow', 'self-healing', 'healing-log.json');
    const healed  = fs.existsSync(healLog)
      ? JSON.parse(fs.readFileSync(healLog, 'utf8')).length
      : 0;

    console.log('\n[qa] ─────────────────────────────────────────────');
    console.log('[qa] QA RESULTS (Cucumber BDD)');
    console.log(`[qa]   Scenarios : ${totalScen} (${passedScen} passed, ${failedScen} failed)`);
    console.log(`[qa]   Steps     : ${passedSteps} passed`);
    console.log(`[qa]   Healed    : ${healed} selector(s) auto-corrected`);
    console.log(`[qa]   Report    : tests/cucumber-report/html/index.html`);
    if (exitCode === 0) {
      console.log('[qa] ✅ All scenarios passed — ready for HITL sign-off');
    } else {
      console.log('[qa] ❌ Some scenarios failed — review above output before approving');
    }
    console.log('[qa] ─────────────────────────────────────────────');
    console.log('[qa] HITL REVIEW REQUIRED — Approve to complete the pipeline.');

    return { totalScen, passedScen, failedScen, healed, exitCode };
  } finally {
    if (serverProc) serverProc.kill();
  }
}

module.exports = { run };

if (require.main === module) {
  run().catch(err => { console.error('[qa] Failed:', err.message); process.exit(1); });
}
