require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { prePhaseHook }        = require('./hooks/pre-phase');
const { postPhaseHook }       = require('./hooks/post-phase');
const { onFailureHook }       = require('./hooks/on-failure');
const { waitForPRApproval, addPRComment } = require('./hitl/reviewer');
const { promptRejectionAction }           = require('./hitl/prompt');

const PHASES = ['requirement_analysis', 'design', 'development', 'testing', 'deployment', 'maintenance'];

// Max times a human can request changes before being asked what to do next
const MAX_HITL_RETRIES = 3;

/**
 * Central Orchestrator — manages agent selection, HITL routing,
 * retry logic, and self-healing across all SDLC phases.
 *
 * HITL rejection behaviour
 * ─────────────────────────
 * • changes_requested WITH feedback  → re-run same phase (up to MAX_HITL_RETRIES=3)
 * • changes_requested, retries used up → prompt user: re-run / restart from phase / abort
 * • timeout (no response in 1 h)     → prompt user: re-run / restart from phase / abort
 * • no decision / unknown            → prompt user: re-run / restart from phase / abort
 *
 * Technical failure behaviour (agent crashes / API errors)
 * ─────────────────────────────────────────────────────────
 * • auto-retry up to 3 times with exponential backoff (1s → 3s → 7s), then throw
 */
class Orchestrator {
  constructor() {
    this.state = {
      currentPhase:     null,
      completedPhases:  [],
      retryHistory:     {},   // technical failure retries per phase
      hitlRetryHistory: {},   // HITL changes-requested retries per phase
      hitlDecisions:    {},
    };
  }

  async runPipeline(startFrom = 'requirement_analysis') {
    const startIndex = PHASES.indexOf(startFrom);
    if (startIndex === -1) throw new Error(`Unknown phase: ${startFrom}`);

    for (const phase of PHASES.slice(startIndex)) {
      await this.runPhase(phase);
    }

    console.log('\n[Orchestrator] ✅ Pipeline complete. All phases finished.');
    return this.state;
  }

  async runPhase(phaseName, hitlFeedback = null) {
    this.state.currentPhase = phaseName;
    this.state.retryHistory[phaseName]     = this.state.retryHistory[phaseName]     || 0;
    this.state.hitlRetryHistory[phaseName] = this.state.hitlRetryHistory[phaseName] || 0;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[Orchestrator] Starting phase: ${phaseName.toUpperCase()}`);
    if (hitlFeedback) console.log(`[Orchestrator] Incorporating HITL feedback: ${hitlFeedback}`);
    console.log('='.repeat(60));

    // ── Pre-phase hook ─────────────────────────────────────────────────────────
    try {
      await prePhaseHook(phaseName);
    } catch (err) {
      console.error(`[Orchestrator] Pre-phase validation failed: ${err.message}`);
      throw err;
    }

    // ── Run phase agent (with auto-retry on technical failure) ─────────────────
    const agent = this.selectAgent(phaseName);
    let output;

    try {
      output = await agent.run({ feedback: hitlFeedback, state: this.state });
    } catch (err) {
      const retryResult = await onFailureHook(
        phaseName, err,
        this.state.retryHistory[phaseName],
        () => agent.run({ feedback: hitlFeedback, state: this.state })
      );

      if (retryResult.escalate) {
        console.error(`[Orchestrator] Phase "${phaseName}" escalated after max technical retries.`);
        throw new Error(`Phase "${phaseName}" failed after max retries: ${retryResult.reason}`);
      }

      output = retryResult.result;
      this.state.retryHistory[phaseName]++;
    }

    // ── Post-phase quality check (auto-retry up to 3 times) ────────────────────
    const qc = await postPhaseHook(phaseName, output);
    if (!qc.passed) {
      this.state.retryHistory[phaseName]++;
      if (this.state.retryHistory[phaseName] >= 3) {
        throw new Error(`Phase "${phaseName}" quality check failed after 3 attempts.`);
      }
      console.warn(`[Orchestrator] Quality check failed for "${phaseName}" — auto-retrying (attempt ${this.state.retryHistory[phaseName]}/3)...`);
      return this.runPhase(phaseName, `Quality issue: ${qc.reason}`);
    }

    // ── HITL gate ──────────────────────────────────────────────────────────────
    const hitlDecision = await this.requestHITLReview(phaseName, output);
    this.state.hitlDecisions[phaseName] = hitlDecision;

    // Case 1 — Approved ✅
    if (hitlDecision.decision === 'approved') {
      this.state.hitlRetryHistory[phaseName] = 0; // reset for any future re-run
      this.state.completedPhases.push(phaseName);
      console.log(`[Orchestrator] Phase "${phaseName}" approved and complete.`);
      return output;
    }

    // Case 2 — Changes requested WITH feedback
    if (hitlDecision.decision === 'changes_requested') {
      const attempt = this.state.hitlRetryHistory[phaseName] + 1;

      if (attempt <= MAX_HITL_RETRIES) {
        this.state.hitlRetryHistory[phaseName] = attempt;
        console.log(
          `[Orchestrator] HITL changes requested for "${phaseName}" ` +
          `(attempt ${attempt}/${MAX_HITL_RETRIES}). Re-running with feedback.`
        );
        return this.runPhase(phaseName, hitlDecision.feedback);
      }

      // Retry limit reached — fall through to prompt
      console.warn(
        `[Orchestrator] HITL retry limit (${MAX_HITL_RETRIES}) reached for "${phaseName}". ` +
        `Escalating to manual decision.`
      );
    }

    // Case 3 — Timeout or unknown decision (no feedback, no approval)
    if (hitlDecision.decision === 'timeout') {
      console.warn(`[Orchestrator] HITL review timed out for "${phaseName}" (no response within 1 hour).`);
    }

    // ── Prompt user for next action ────────────────────────────────────────────
    const userAction = await promptRejectionAction(phaseName, PHASES);
    return this._handleRejectionAction(userAction, phaseName);
  }

  /**
   * Executes the user's chosen action after a rejected / timed-out HITL gate.
   * @param {{ action: 're-run'|'restart'|'abort', targetPhase?: string }} action
   */
  async _handleRejectionAction(action, currentPhase) {
    if (action.action === 'abort') {
      throw new Error(`Pipeline aborted by user at phase "${currentPhase}".`);
    }

    if (action.action === 're-run') {
      // Reset HITL retry counter so the phase gets a fresh set of attempts
      this.state.hitlRetryHistory[currentPhase] = 0;
      return this.runPhase(currentPhase);
    }

    if (action.action === 'restart') {
      const targetPhase = action.targetPhase;
      const targetIndex = PHASES.indexOf(targetPhase);

      // Roll back completed-phases state to before the target phase
      this.state.completedPhases = this.state.completedPhases.filter(
        p => PHASES.indexOf(p) < targetIndex
      );
      // Reset retry counters for all phases from target onwards
      for (const p of PHASES.slice(targetIndex)) {
        delete this.state.retryHistory[p];
        delete this.state.hitlRetryHistory[p];
      }

      console.log(`[Orchestrator] Rolling back to phase "${targetPhase}" and resuming pipeline.`);
      return this.runPipeline(targetPhase);
    }

    throw new Error(`Unknown rejection action: ${action.action}`);
  }

  selectAgent(phaseName) {
    const agents = {
      requirement_analysis: require('./phases/requirement_analysis'),
      design:               require('./phases/design'),
      development:          require('./phases/development'),
      testing:              require('./phases/testing'),
      deployment:           require('./phases/deployment'),
      maintenance:          require('./phases/maintenance'),
    };

    if (!agents[phaseName]) throw new Error(`No agent registered for phase: ${phaseName}`);
    console.log(`[Orchestrator] Selected agent: ${phaseName}`);
    return agents[phaseName];
  }

  async requestHITLReview(phaseName, output) {
    // Development phase: HITL via GitHub PR review
    if (phaseName === 'development' && output.prNumber) {
      console.log(`[HITL] Awaiting PR #${output.prNumber} review on GitHub...`);
      return waitForPRApproval(output.prNumber);
    }

    // Other phases with a PR: post comment then wait
    if (output.prNumber) {
      const summary = JSON.stringify(output, null, 2).slice(0, 1000);
      await addPRComment(
        output.prNumber,
        `## HITL Review Request: ${phaseName}\n\`\`\`json\n${summary}\n\`\`\`\nPlease approve or request changes.`
      );
      return waitForPRApproval(output.prNumber);
    }

    // Fallback: auto-approve (phase has no PR wired up yet)
    console.log(`[HITL:${phaseName}] No PR — auto-approving. Wire up PR creation for full HITL.`);
    return { decision: 'approved' };
  }
}

module.exports = new Orchestrator();

// Entry point: node workflow/orchestrator.js [startPhase]
if (require.main === module) {
  const startPhase = process.argv[2] || 'requirement_analysis';
  const orchestrator = module.exports;
  orchestrator.runPipeline(startPhase).catch(err => {
    console.error('[Orchestrator] Pipeline failed:', err.message);
    process.exit(1);
  });
}
