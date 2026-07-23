require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

/**
 * Testing Phase Agent — delegates to qa.js (Playwright E2E)
 */

const qa = require('./qa');

async function run({ feedback } = {}) {
  console.log('[testing] Testing Phase Agent starting...');
  return qa.run({ feedback });
}

module.exports = { run };

if (require.main === module) {
  run().catch(err => { console.error('[testing] Failed:', err.message); process.exit(1); });
}
