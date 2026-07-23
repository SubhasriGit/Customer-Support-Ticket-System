require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Build Phase Agent (DevOps Persona)
 * - Runs npm build for frontend
 * - Packages backend
 * - Produces deployable artifact
 */

function run_cmd(cmd, cwd) {
  console.log(`[build] $ ${cmd}`);
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: 'inherit' });
}

async function run({ feedback } = {}) {
  console.log('[build] DevOps Agent starting...');
  if (feedback) console.log(`[build] Incorporating feedback: ${feedback}`);

  const root = path.join(__dirname, '../..');
  const frontendDir = path.join(root, 'frontend');
  const backendDir  = path.join(root, 'backend');
  const distDir     = path.join(root, 'dist');

  // Build frontend
  console.log('[build] Building React frontend...');
  run_cmd('npm install --legacy-peer-deps', frontendDir);
  run_cmd('npm run build', frontendDir);

  // Install backend deps
  console.log('[build] Installing backend dependencies...');
  run_cmd('npm install', backendDir);

  // Create dist folder
  fs.mkdirSync(distDir, { recursive: true });

  // Copy frontend build output
  run_cmd(`xcopy /E /I /Y "${path.join(frontendDir, 'build')}" "${path.join(distDir, 'public')}"`, root);

  // Copy backend
  run_cmd(`xcopy /E /I /Y "${backendDir}" "${path.join(distDir, 'server')}" /EXCLUDE:${path.join(root, 'scripts', 'xcopy-exclude.txt')}`, root);

  const artifactPath = distDir;
  console.log(`[build] Artifact ready at: ${artifactPath}`);
  return { artifactPath };
}

module.exports = { run };
