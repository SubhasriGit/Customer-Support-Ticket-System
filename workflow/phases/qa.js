require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { execSync, spawn } = require('child_process');
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
  console.log('\n[qa] Step 1/3 — Starting server on port 3000...');
  let serverProc = null;
  const alreadyUp = (() => {
    try { execSync('curl -sf http://localhost:3000/health', { stdio: 'pipe' }); return true; } catch { return false; }
  })();

  if (alreadyUp) {
    console.log('[qa] Server already running on port 3000.');
  } else {
    serverProc = spawn('node', ['server.js'], {
      cwd: BACKEND,
      env: { ...process.env, PORT: '3000' },
      detached: false,
      stdio: 'inherit',
    });
    console.log('[qa] Waiting for server to be ready...');
    if (!waitForPort(3000)) throw new Error('Server did not start within 30s');
    console.log('[qa] ✅ Server ready at http://localhost:3000');
  }

  try {
    // ── 2. Run Playwright tests ─────────────────────────────────────────────
    console.log('\n[qa] Step 2/3 — Running Playwright E2E tests...');
    let output = '';
    let exitCode = 0;
    try {
      output = execSync('npx playwright test --reporter=list', {
        cwd: TESTS,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (err) {
      output = (err.stdout || '') + (err.stderr || '');
      exitCode = err.status || 1;
    }

    console.log(output);

    // ── 3. Parse results ─────────────────────────────────────────────────────
    console.log('\n[qa] Step 3/3 — Parsing results...');
    const passMatch  = output.match(/(\d+) passed/);
    const failMatch  = output.match(/(\d+) failed/);
    const totalMatch = output.match(/Running (\d+) tests/);
    const passed  = passMatch  ? parseInt(passMatch[1])  : 0;
    const failed  = failMatch  ? parseInt(failMatch[1])  : 0;
    const total   = totalMatch ? parseInt(totalMatch[1]) : passed + failed;
    const healLog = path.join(ROOT, 'workflow', 'self-healing', 'healing-log.json');
    const healed  = fs.existsSync(healLog)
      ? JSON.parse(fs.readFileSync(healLog, 'utf8')).length
      : 0;

    console.log('\n[qa] ─────────────────────────────────────────────');
    console.log('[qa] QA RESULTS');
    console.log(`[qa]   Total  : ${total}`);
    console.log(`[qa]   Passed : ${passed}`);
    console.log(`[qa]   Failed : ${failed}`);
    console.log(`[qa]   Healed : ${healed} selector(s) auto-corrected`);
    console.log(`[qa]   Report : tests/playwright-report/`);
    if (exitCode === 0) {
      console.log('[qa] ✅ All tests passed — ready for HITL sign-off');
    } else {
      console.log('[qa] ❌ Some tests failed — review above output before approving');
    }
    console.log('[qa] ─────────────────────────────────────────────');
    console.log('[qa] HITL REVIEW REQUIRED — Approve to complete the pipeline.');

    return { total, passed, failed, healed, exitCode };
  } finally {
    if (serverProc) serverProc.kill();
  }
}

module.exports = { run };

if (require.main === module) {
  run().catch(err => { console.error('[qa] Failed:', err.message); process.exit(1); });
}
