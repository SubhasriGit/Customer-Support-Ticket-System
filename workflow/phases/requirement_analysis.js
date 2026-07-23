require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

/**
 * Requirement Analysis Phase Agent (BA Persona)
 * Combines analysis (JIRA epic/story/subtask creation) and
 * planning (sprint breakdown + story estimates) into a single phase.
 */

const analysis = require('./analysis');
const plan     = require('./plan');

async function run({ feedback } = {}) {
  console.log('[requirement_analysis] Starting Requirement Analysis phase...');

  // Step 1 — BA analysis: create JIRA epic, stories, subtasks
  console.log('\n[requirement_analysis] Step 1/2 — BA Analysis (JIRA hierarchy)...');
  const analysisResult = await analysis.run({ feedback });

  // Step 2 — Planning: sprint breakdown + story estimates
  console.log('\n[requirement_analysis] Step 2/2 — Sprint Planning (JIRA updates)...');
  const planResult = await plan.run({ feedback });

  const result = { ...analysisResult, ...planResult };

  console.log('\n[requirement_analysis] ─────────────────────────────────────────');
  console.log('[requirement_analysis] REQUIREMENT ANALYSIS COMPLETE');
  console.log('[requirement_analysis]   JIRA epics, stories, subtasks created');
  console.log('[requirement_analysis]   Sprint plan and estimates applied');
  console.log('[requirement_analysis] HITL REVIEW REQUIRED — Approve to proceed to Design.');
  console.log('[requirement_analysis] ─────────────────────────────────────────');

  return result;
}

module.exports = { run };

if (require.main === module) {
  run().catch(err => { console.error('[requirement_analysis] Failed:', err.message); process.exit(1); });
}
