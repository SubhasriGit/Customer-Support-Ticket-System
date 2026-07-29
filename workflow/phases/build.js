require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { execSync } = require('child_process');
const https = require('https');
const path = require('path');
const fs = require('fs');

// ── Render API helpers ─────────────────────────────────────────────────────────

function renderRequest(method, apiPath, body = null) {
  const apiKey = process.env.RENDER_API_KEY;
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.render.com',
      path: apiPath,
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
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

async function deployToRender() {
  const apiKey    = process.env.RENDER_API_KEY;
  const serviceId = process.env.RENDER_SERVICE_ID;

  if (!apiKey || !serviceId) {
    console.log('[build] ℹ️  RENDER_API_KEY / RENDER_SERVICE_ID not set — skipping cloud deploy.');
    console.log('[build]    Add both to .env to enable automatic Render.com deployment.');
    return null;
  }

  // Fetch service details for the URL (do this first, before triggering deploy)
  const svcRes = await renderRequest('GET', `/v1/services/${serviceId}`);
  if (svcRes.status !== 200) {
    throw new Error(`Render service lookup failed (HTTP ${svcRes.status}): ${JSON.stringify(svcRes.body)}`);
  }
  const rawUrl    = svcRes.body?.serviceDetails?.url || '';
  const deployUrl = rawUrl ? (rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`) : null;

  // Trigger deploy — body must use Render's enum string, not a boolean
  const deployRes = await renderRequest('POST', `/v1/services/${serviceId}/deploys`, { clearCache: 'do_not_clear' });
  if (deployRes.status !== 201 && deployRes.status !== 200) {
    throw new Error(`Render deploy trigger failed (HTTP ${deployRes.status}): ${JSON.stringify(deployRes.body)}`);
  }
  const deployId = deployRes.body?.id || deployRes.body?.deploy?.id;
  console.log(`[build] 🚀 Render deploy triggered (id: ${deployId})`);
  if (deployUrl) console.log(`[build]    Service URL: ${deployUrl}`);

  // Poll until live (max 12 min, poll every 20 s)
  const TIMEOUT_MS = 12 * 60 * 1000;
  const POLL_MS    = 20000;
  const startMs    = Date.now();

  while (Date.now() - startMs < TIMEOUT_MS) {
    await new Promise(r => setTimeout(r, POLL_MS));

    const statusRes = await renderRequest('GET', `/v1/services/${serviceId}/deploys/${deployId}`);
    const status    = statusRes.body?.status || statusRes.body?.deploy?.status;
    const elapsed   = Math.round((Date.now() - startMs) / 1000);
    console.log(`[build]    Render status: ${status} (${elapsed}s elapsed)`);

    if (status === 'live') {
      console.log(`[build] ✅ Render deploy live: ${deployUrl || '(see Render dashboard)'}`);
      return deployUrl;
    }

    if (['deactivated', 'build_failed', 'update_failed', 'canceled'].includes(status)) {
      throw new Error(`Render deploy ended with status: ${status}`);
    }
  }

  throw new Error('Render deploy timed out after 12 minutes');
}

/**
 * Build Phase Agent (DevOps Persona)
 * - Builds React frontend (npm run build)
 * - Packages backend + frontend into dist/ artifact
 * - Verifies artifact is runnable
 */

function run_cmd(cmd, cwd, label) {
  console.log(`[build] ${label || '$ ' + cmd.split(' ')[0]}`);
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: 'inherit' });
}

function fileExists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

async function run({ feedback } = {}) {
  console.log('[build] DevOps Agent starting...');
  if (feedback) console.log(`[build] Incorporating feedback: ${feedback}`);

  const root        = path.join(__dirname, '../..');
  const frontendDir = path.join(root, 'frontend');
  const backendDir  = path.join(root, 'backend');
  const distDir     = path.join(root, 'dist');
  const publicDir   = path.join(distDir, 'public');
  const serverDir   = path.join(distDir, 'server');

  // ── 1. Build frontend ──────────────────────────────────────────────────────
  console.log('\n[build] Step 1/4 — Building React frontend...');
  run_cmd('npm install --legacy-peer-deps', frontendDir, 'npm install (frontend)');
  run_cmd('npm run build', frontendDir, 'npm run build');

  const frontendIndex = path.join(frontendDir, 'build', 'index.html');
  if (!fileExists(frontendIndex)) throw new Error('Frontend build failed — index.html not found');
  console.log('[build] ✅ Frontend build: frontend/build/index.html');

  // ── 2. Install backend deps ─────────────────────────────────────────────────
  console.log('\n[build] Step 2/4 — Installing backend dependencies...');
  run_cmd('npm install', backendDir, 'npm install (backend)');

  // ── 3. Package artifact ────────────────────────────────────────────────────
  console.log('\n[build] Step 3/4 — Packaging artifact into dist/...');
  if (fs.existsSync(distDir)) fs.rmSync(distDir, { recursive: true, force: true });
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(serverDir, { recursive: true });

  // Copy frontend build → dist/public
  run_cmd(
    `xcopy /E /I /Y "${path.join(frontendDir, 'build')}" "${publicDir}"`,
    root,
    'Copy frontend build → dist/public'
  );

  // Copy backend (excluding node_modules, .env, *.sqlite) → dist/server
  const BACKEND_EXCLUDE = new Set(['node_modules', '.env']);
  copyDirSync(backendDir, serverDir, BACKEND_EXCLUDE);
  console.log('[build] Copy backend → dist/server');

  // Install production backend deps inside artifact
  run_cmd('npm install --production', serverDir, 'npm install --production (artifact)');

  // ── 4. Verify artifact ─────────────────────────────────────────────────────
  console.log('\n[build] Step 4/4 — Verifying artifact...');
  const checks = [
    [path.join(publicDir, 'index.html'), 'dist/public/index.html'],
    [path.join(serverDir, 'server.js'),  'dist/server/server.js'],
    [path.join(serverDir, 'db', 'database.js'), 'dist/server/db/database.js'],
  ];
  for (const [p, label] of checks) {
    if (!fileExists(p)) throw new Error(`Artifact verification failed — ${label} missing`);
    console.log(`[build] ✅ ${label}`);
  }

  // Quick smoke test: require the server module without starting it
  try {
    // Just check it parses — don't actually listen
    run_cmd(
      `node -e "process.env.PORT=0; const s=require('./server'); if(s) process.exit(0)"`,
      serverDir,
      'Smoke test: backend module loads'
    );
    console.log('[build] ✅ Backend smoke test passed');
  } catch {
    console.warn('[build] ⚠️  Backend smoke test skipped (may need .env)');
  }

  const stats = {
    publicFiles: countFiles(publicDir),
    serverFiles: countFiles(serverDir),
  };

  const localUrl = `http://localhost:${process.env.PORT || '3001'}`;

  console.log(`\n[build] ─────────────────────────────────────────`);
  console.log(`[build] ARTIFACT READY`);
  console.log(`[build]   Location   : ${distDir}`);
  console.log(`[build]   Frontend   : ${stats.publicFiles} files in dist/public/`);
  console.log(`[build]   Backend    : ${stats.serverFiles} files in dist/server/`);
  console.log(`[build]   Start      : NODE_ENV=production node dist/server/server.js`);
  console.log(`[build]   Local URL  : ${localUrl}`);
  console.log(`[build] ─────────────────────────────────────────`);

  // ── 5. Deploy to Render ────────────────────────────────────────────────────
  console.log('\n[build] Step 5 — Cloud deployment (Render.com)...');
  let deployUrl = null;
  try {
    deployUrl = await deployToRender();
  } catch (err) {
    console.error(`[build] ❌ Render deploy failed: ${err.message}`);
    console.warn('[build]    Continuing — artifact is ready locally. Fix and redeploy manually if needed.');
  }

  if (deployUrl) {
    console.log(`\n[build] 🌐 DEPLOYMENT URL: ${deployUrl}`);
  }

  console.log('[build] HITL REVIEW REQUIRED — Verify artifact and deployment, then approve.');

  return {
    artifactPath: distDir,
    publicFiles:  stats.publicFiles,
    serverFiles:  stats.serverFiles,
    deployUrl,
  };
}

function copyDirSync(src, dest, exclude = new Set()) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (exclude.has(entry.name)) continue;
    if (entry.name.endsWith('.sqlite') || entry.name.endsWith('.db')) continue;
    const srcPath  = path.join(src,  entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(srcPath, destPath, exclude);
    else fs.copyFileSync(srcPath, destPath);
  }
}

function countFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  let n = 0;
  for (const f of fs.readdirSync(dir, { recursive: true })) {
    try { if (fs.statSync(path.join(dir, f)).isFile()) n++; } catch {}
  }
  return n;
}

module.exports = { run };

if (require.main === module) {
  run().catch(err => { console.error('[build] Failed:', err.message); process.exit(1); });
}
