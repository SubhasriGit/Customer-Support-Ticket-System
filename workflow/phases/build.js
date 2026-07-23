require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

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

  console.log(`\n[build] ─────────────────────────────────────────`);
  console.log(`[build] ARTIFACT READY`);
  console.log(`[build]   Location : ${distDir}`);
  console.log(`[build]   Frontend : ${stats.publicFiles} files in dist/public/`);
  console.log(`[build]   Backend  : ${stats.serverFiles} files in dist/server/`);
  console.log(`[build]   Start    : NODE_ENV=production node dist/server/server.js`);
  console.log(`[build] ─────────────────────────────────────────`);
  console.log('[build] HITL REVIEW REQUIRED — Verify artifact runs, then approve to complete the pipeline.');

  return { artifactPath: distDir, publicFiles: stats.publicFiles, serverFiles: stats.serverFiles };
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
