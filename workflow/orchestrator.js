require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { prePhaseHook } = require('./hooks/pre-phase');
const { postPhaseHook } = require('./hooks/post-phase');
const { onFailureHook } = require('./hooks/on-failure');
const { waitForPRApproval, addPRComment } = require('./hitl/reviewer');

const PHASES = ['requirement_analysis', 'design', 'development', 'testing', 'deployment', 'maintenance'];

/**
 * Central Orchestrator — manages agent selection, HITL routing,
 * retry logic, and self-healing across all SDLC phases.
 */
class Orchestrator {
  constructor() {
    this.state = {
      currentPhase: null,
      completedPhases: [],
      retryHistory: {},
      hitlDecisions: {},
    };
  }

  async runPipeline(startFrom = 'analysis') {
    const startIndex = PHASES.indexOf(startFrom);
    if (startIndex === -1) throw new Error(`Unknown phase: ${startFrom}`);

    for (const phase of PHASES.slice(startIndex)) {
      await this.runPhase(phase);
    }

    console.log('\n[Orchestrator] Pipeline complete. All phases finished.');
    return this.state;
  }

  async runPhase(phaseName, hitlFeedback = null) {
    this.state.currentPhase = phaseName;
    this.state.retryHistory[phaseName] = this.state.retryHistory[phaseName] || 0;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`[Orchestrator] Starting phase: ${phaseName.toUpperCase()}`);
    if (hitlFeedback) console.log(`[Orchestrator] Incorporating HITL feedback: ${hitlFeedback}`);
    console.log('='.repeat(60));

    // Pre-phase hook: validate environment and prerequisites
    try {
      await prePhaseHook(phaseName);
    } catch (err) {
      console.error(`[Orchestrator] Pre-phase validation failed: ${err.message}`);
      throw err;
    }

    // Select and run the phase agent
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
        console.error(`[Orchestrator] Phase "${phaseName}" escalated to HITL after max retries.`);
        throw new Error(`Phase "${phaseName}" failed after max retries: ${retryResult.reason}`);
      }

      output = retryResult.result;
      this.state.retryHistory[phaseName]++;
    }

    // Post-phase hook: quality check
    const qc = await postPhaseHook(phaseName, output);
    if (!qc.passed) {
      console.warn(`[Orchestrator] Quality check failed for "${phaseName}". Auto-retrying with correction...`);
      this.state.retryHistory[phaseName]++;

      if (this.state.retryHistory[phaseName] >= 3) {
        throw new Error(`Phase "${phaseName}" quality check failed after 3 attempts.`);
      }
      return this.runPhase(phaseName, `Quality issue: ${qc.reason}`);
    }

    // HITL gate: request human review
    const hitlDecision = await this.requestHITLReview(phaseName, output);
    this.state.hitlDecisions[phaseName] = hitlDecision;

    if (hitlDecision.decision === 'changes_requested') {
      console.log(`[Orchestrator] HITL requested changes for "${phaseName}". Re-running with feedback.`);
      this.state.retryHistory[phaseName]++;
      return this.runPhase(phaseName, hitlDecision.feedback);
    }

    if (hitlDecision.decision === 'approved') {
      this.state.completedPhases.push(phaseName);
      console.log(`[Orchestrator] Phase "${phaseName}" approved and complete.`);
    }

    return output;
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
    // For development phase: HITL is via GitHub PR review
    if (phaseName === 'development' && output.prNumber) {
      console.log(`[HITL] Awaiting PR #${output.prNumber} review on GitHub...`);
      return waitForPRApproval(output.prNumber);
    }

    // For other phases: HITL via PR/issue comment on GitHub
    if (output.prNumber) {
      const summary = JSON.stringify(output, null, 2).slice(0, 1000);
      await addPRComment(output.prNumber, `## HITL Review Request: ${phaseName}\n\`\`\`json\n${summary}\n\`\`\`\nPlease review and approve or request changes.`);
      return waitForPRApproval(output.prNumber);
    }

    // Fallback: auto-approve (for phases without a PR yet)
    console.log(`[HITL:${phaseName}] No PR available — auto-approving for now. Wire up PR creation in this phase for full HITL.`);
    return { decision: 'approved' };
  }
}

module.exports = new Orchestrator();

// Entry point: node workflow/orchestrator.js [phase]
if (require.main === module) {
  const startPhase = process.argv[2] || 'analysis';
  const orchestrator = module.exports;
  orchestrator.runPipeline(startPhase).catch(err => {
    console.error('[Orchestrator] Pipeline failed:', err.message);
    process.exit(1);
  });
}
