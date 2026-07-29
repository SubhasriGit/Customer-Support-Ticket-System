require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { prePhaseHook }        = require('./hooks/pre-phase');
const { postPhaseHook }       = require('./hooks/post-phase');
const { onFailureHook }       = require('./hooks/on-failure');
const { waitForPRApproval, addPRComment, waitForStdinApproval } = require('./hitl/reviewer');
const { promptRejectionAction }           = require('./hitl/prompt');
const { writeRunDetails }                 = require('./report/run-details');

const PHASES = ['requirement_analysis', 'project_planning', 'app_analysis', 'design', 'development', 'testing', 'deployment', 'maintenance'];

// ── HITL link formatter ────────────────────────────────────────────────────────
const JIRA_BASE = (process.env.JIRA_BASE_URL         || '').replace(/\/$/, '');
const CONF_BASE = (process.env.CONFLUENCE_BASE_URL   || '').replace(/\/$/, '');
const CONF_SPACE = process.env.CONFLUENCE_SPACE_KEY  || '';
const GH_OWNER  = process.env.GITHUB_OWNER;
const GH_REPO   = process.env.GITHUB_REPO;

function jiraUrl(key)    { return JIRA_BASE ? `${JIRA_BASE}/browse/${key}` : key; }
function confUrl(pageId) {
  const spaceSeg = CONF_SPACE ? `/spaces/${CONF_SPACE}` : '';
  return CONF_BASE ? `${CONF_BASE}${spaceSeg}/pages/${pageId}` : pageId;
}

function buildHITLLinks(phaseName, output = {}) {
  const lines = [];

  switch (phaseName) {
    case 'requirement_analysis':
      (output.epics   || []).forEach(k => lines.push(`  Epic   → ${jiraUrl(k)}`));
      (output.stories || []).forEach(k => lines.push(`  Story  → ${jiraUrl(k)}`));
      if (output.plan?.sprints?.length) {
        lines.push(`  Sprint plan: ${output.plan.sprints.length} sprints / ${output.plan.totalStoryPoints} pts`);
      }
      break;

    case 'project_planning':
      if (output.mrUrl)            lines.push(`  MR           → ${output.mrUrl}`);
      if (output.planDocUrl)       lines.push(`  Wiki Plan    → ${output.planDocUrl}`);
      if (output.milestoneCount)   lines.push(`  Milestones   : ${output.milestoneCount} created`);
      if (output.issueCount)       lines.push(`  Issues       : ${output.issueCount} created`);
      if (output.sprints)          lines.push(`  Sprints      : ${output.sprints}`);
      if (output.totalStoryPoints) lines.push(`  Story points : ${output.totalStoryPoints}`);
      break;

    case 'app_analysis':
      if (output.confluenceUrl) lines.push(`  Gap Report → ${output.confluenceUrl}`);
      (output.jiraTasks || []).forEach(k => lines.push(`  Task   → ${jiraUrl(k)}`));
      if (output.gaps?.length) lines.push(`  ${output.gaps.length} gap(s) identified`);
      break;

    case 'design':
      if (output.confluenceUrl) lines.push(`  Architecture → ${output.confluenceUrl}`);
      if (output.hld)            lines.push(`  HLD          → ${confUrl(output.hld)}`);
      if (output.lld)            lines.push(`  LLD          → ${confUrl(output.lld)}`);
      if (output.wireframes)     lines.push(`  Wireframes   → ${confUrl(output.wireframes)}`);
      break;

    case 'development':
      if (output.prUrl)  lines.push(`  PR #${output.prNumber} → ${output.prUrl}`);
      if (output.branch && GH_OWNER && GH_REPO) {
        lines.push(`  Branch → https://github.com/${GH_OWNER}/${GH_REPO}/tree/${output.branch}`);
      }
      break;

    case 'testing':
      if (output.totalScen !== undefined) {
        lines.push(`  Scenarios: ${output.passedScen}/${output.totalScen} passed`);
      }
      if (output.healed) lines.push(`  ${output.healed} selector(s) self-healed`);
      lines.push(`  HTML report → tests/cucumber-report/report.html`);
      break;

    case 'deployment':
      if (output.deployUrl)     lines.push(`  Live URL     → ${output.deployUrl}`);
      if (output.confluenceUrl) lines.push(`  FRD          → ${output.confluenceUrl}`);
      if (output.artifactPath)  lines.push(`  Artifact     → ${output.artifactPath}`);
      break;

    case 'maintenance':
      if (output.jiraKey)    lines.push(`  Ticket → ${jiraUrl(output.jiraKey)}`);
      if (output.confPageId) lines.push(`  Runbook → ${confUrl(output.confPageId)}`);
      if (output.renderUrl)  lines.push(`  Render → ${output.renderUrl}`);
      if (output.healthStatus) lines.push(`  Health: ${output.healthStatus}`);
      break;
  }

  return lines.join('\n');
}

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
      phaseOutputs:     {},   // raw output returned by each phase agent
    };
    this.runStartedAt = null;
  }

  async runPipeline(startFrom = 'requirement_analysis') {
    const startIndex = PHASES.indexOf(startFrom);
    if (startIndex === -1) throw new Error(`Unknown phase: ${startFrom}`);

    if (!this.runStartedAt) this.runStartedAt = new Date();

    for (const phase of PHASES.slice(startIndex)) {
      await this.runPhase(phase);
    }

    console.log('\n[Orchestrator] ✅ Pipeline complete. All phases finished.');
    writeRunDetails(this.state, this.runStartedAt);
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

    // ── Store phase output for run report ─────────────────────────────────────
    this.state.phaseOutputs[phaseName] = output;

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
      project_planning:     require('./phases/project_planning'),
      app_analysis:         require('./phases/app_analysis'),
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
    const links = buildHITLLinks(phaseName, output);
    const summary = links || '  (no links generated for this phase)';

    // Development phase: HITL via GitHub PR review + stdin fallback
    if (phaseName === 'development' && output.prNumber) {
      if (links) console.log(`\n[HITL] Links created this phase:\n${links}`);
      return waitForPRApproval(output.prNumber);
    }

    // All other phases: stdin HITL with formatted links
    return waitForStdinApproval(phaseName, summary);
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
