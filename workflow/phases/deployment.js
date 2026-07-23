require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

/**
 * Deployment Phase Agent (DevOps + Technical Writer Persona)
 * Combines documentation (README, FRD, API docs → Confluence + Git)
 * and build (artifact packaging + smoke test).
 */

const documentation = require('./documentation');
const build         = require('./build');

async function run({ feedback } = {}) {
  console.log('[deployment] Starting Deployment phase...');

  // Step 1 — Documentation: README, FRD, API docs
  console.log('\n[deployment] Step 1/2 — Publishing documentation...');
  const docsResult = await documentation.run({ feedback });

  // Step 2 — Build: package artifact, smoke test
  console.log('\n[deployment] Step 2/2 — Building and packaging artifact...');
  const buildResult = await build.run({ feedback });

  const result = { ...docsResult, ...buildResult };

  console.log('\n[deployment] ─────────────────────────────────────────');
  console.log('[deployment] DEPLOYMENT PHASE COMPLETE');
  console.log('[deployment]   Documentation published to Confluence + Git');
  console.log(`[deployment]   Artifact ready at: ${buildResult.artifactPath || 'dist/'}`);
  console.log('[deployment] HITL REVIEW REQUIRED — Verify artifact, then approve.');
  console.log('[deployment] ─────────────────────────────────────────');

  return result;
}

module.exports = { run };

if (require.main === module) {
  run().catch(err => { console.error('[deployment] Failed:', err.message); process.exit(1); });
}
