const readline = require('readline');

function ask(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

/**
 * Prompts the user when a phase is rejected without feedback or times out.
 * Returns one of:
 *   { action: 're-run' }                     — re-run same phase from scratch
 *   { action: 'restart', targetPhase: name } — restart pipeline from chosen phase
 *   { action: 'abort' }                      — abort the pipeline
 */
async function promptRejectionAction(phaseName, allPhases) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[HITL] Phase "${phaseName}" was not approved.`);
  console.log('[HITL] What would you like to do?');
  console.log('  [1] Re-run this phase (no feedback)');
  console.log('  [2] Restart pipeline from a specific phase');
  console.log('  [3] Abort the pipeline');
  console.log('─'.repeat(60));

  let choice;
  while (!['1', '2', '3'].includes(choice)) {
    choice = await ask('[HITL] Enter choice (1 / 2 / 3): ');
    if (!['1', '2', '3'].includes(choice)) {
      console.log('[HITL] Invalid input — enter 1, 2, or 3.');
    }
  }

  if (choice === '1') {
    console.log(`[HITL] Re-running phase "${phaseName}"...`);
    return { action: 're-run' };
  }

  if (choice === '3') {
    console.log('[HITL] Pipeline aborted by user.');
    return { action: 'abort' };
  }

  // choice === '2' — ask which phase to restart from
  console.log('\n[HITL] Available phases:');
  allPhases.forEach((p, i) => console.log(`  [${i + 1}] ${p}`));

  let targetPhase;
  while (!targetPhase) {
    const input = await ask('[HITL] Enter phase number or name: ');
    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= allPhases.length) {
      targetPhase = allPhases[num - 1];
    } else if (allPhases.includes(input)) {
      targetPhase = input;
    } else {
      console.log(`[HITL] Invalid choice. Enter a number (1–${allPhases.length}) or a phase name.`);
    }
  }

  console.log(`[HITL] Restarting pipeline from phase "${targetPhase}"...`);
  return { action: 'restart', targetPhase };
}

module.exports = { promptRejectionAction };
