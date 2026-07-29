require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { publishWikiPage, createMilestone, createIssue, createBranch, commitFile, createMergeRequest } = require('../integrations/gitlab');

const GITLAB_BASE      = (process.env.GITLAB_BASE_URL  || 'https://gitlab.com').replace(/\/$/, '');
const GITLAB_NAMESPACE = process.env.GITLAB_NAMESPACE  || process.env.GITLAB_PROJECT_ID || '';

// ── Plan document builder ──────────────────────────────────────────────────────

function fmtDate() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function buildPlanDocument(analysisOutput, feedback) {
  const epics   = analysisOutput.epics   || [];
  const stories = analysisOutput.stories || [];
  const plan    = analysisOutput.plan    || {};
  const sprints = plan.sprints           || [];
  const totalPts = plan.totalStoryPoints || sprints.flatMap(s => s.stories || []).reduce((a, x) => a + (x.points || 0), 0);

  const JIRA_BASE = (process.env.JIRA_BASE_URL || '').replace(/\/$/, '');
  const jiraLink  = key => JIRA_BASE ? `[${key}](${JIRA_BASE}/browse/${key})` : `\`${key}\``;

  const lines = [];

  // ── Header ─────────────────────────────────────────────────────────────────
  lines.push(`# CSTS Project Plan — ${fmtDate()}`);
  lines.push('');
  lines.push('> **Project:** Customer Support Ticket System  ');
  lines.push('> **Pipeline:** AI-Driven SDLC — Phase 2 Output  ');
  lines.push('> **Status:** Pending HITL Approval  ');
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── 1. Project Overview ────────────────────────────────────────────────────
  lines.push('## 1. Project Overview');
  lines.push('');
  lines.push('The Customer Support Ticket System (CSTS) is an AI-enhanced support platform that enables');
  lines.push('agents to submit, triage, and resolve customer tickets. This plan covers the features and');
  lines.push('sprints approved in the Requirement Analysis phase.');
  if (feedback) {
    lines.push('');
    lines.push(`> **Revision note:** ${feedback}`);
  }
  lines.push('');

  // ── 2. Goals & Objectives ─────────────────────────────────────────────────
  lines.push('## 2. Goals & Objectives');
  lines.push('');
  if (epics.length > 0) {
    epics.forEach(key => lines.push(`- Deliver epic ${jiraLink(key)}`));
  } else {
    lines.push('- Deliver all approved epics from Requirement Analysis');
  }
  lines.push('- Complete all stories within the agreed sprint timeline');
  lines.push('- Achieve HITL approval at each pipeline gate before proceeding');
  lines.push('');

  // ── 3. JIRA Story Map ─────────────────────────────────────────────────────
  lines.push('## 3. JIRA Story Map');
  lines.push('');
  if (epics.length > 0) {
    epics.forEach(epic => {
      lines.push(`### Epic: ${jiraLink(epic)}`);
      lines.push('');
      const epicStories = stories.length > 0 ? stories : [];
      if (epicStories.length > 0) {
        epicStories.forEach(s => lines.push(`- ${jiraLink(s)}`));
      } else {
        lines.push('- *(Stories listed in sprint plan below)*');
      }
      lines.push('');
    });
  } else if (stories.length > 0) {
    lines.push('### Stories');
    lines.push('');
    stories.forEach(s => lines.push(`- ${jiraLink(s)}`));
    lines.push('');
  } else {
    lines.push('*No JIRA items found in Requirement Analysis output.*');
    lines.push('');
  }

  // ── 4. Sprint Timeline ────────────────────────────────────────────────────
  lines.push('## 4. Sprint Timeline');
  lines.push('');
  lines.push(`**Total story points:** ${totalPts}  `);
  lines.push(`**Estimated duration:** ${plan.estimatedTotal || `${sprints.length * 2} weeks`}  `);
  lines.push('');

  if (sprints.length > 0) {
    sprints.forEach((sprint, i) => {
      const sprintName = sprint.sprint || sprint.name || `Sprint ${i + 1}`;
      const duration   = sprint.duration || '2 weeks';
      const sprintPts  = (sprint.stories || []).reduce((a, s) => a + (s.points || 0), 0);
      const deps       = (sprint.dependencies || []).join(', ') || 'None';

      lines.push(`### ${sprintName}`);
      lines.push('');
      lines.push(`| Field | Value |`);
      lines.push(`|---|---|`);
      lines.push(`| Duration | ${duration} |`);
      lines.push(`| Story points | ${sprintPts} |`);
      lines.push(`| Dependencies | ${deps} |`);
      lines.push('');

      if (sprint.stories && sprint.stories.length > 0) {
        lines.push('**Stories**');
        lines.push('');
        sprint.stories.forEach(s => {
          const key  = typeof s === 'string' ? s : s.key;
          const sum  = s.summary  ? ` — ${s.summary}`  : '';
          const pri  = s.priority ? ` *(${s.priority})*` : '';
          const pts  = s.points   ? ` · ${s.points} pts` : '';
          lines.push(`- ${jiraLink(key)}${sum}${pts}${pri}`);
        });
        lines.push('');
      }

      if (sprint.rationale) {
        lines.push(`**Rationale:** ${sprint.rationale}`);
        lines.push('');
      }
    });
  } else {
    lines.push('*Sprint plan not yet generated — run Requirement Analysis phase first.*');
    lines.push('');
  }

  // ── 5. Risk Register ──────────────────────────────────────────────────────
  lines.push('## 5. Risk Register');
  lines.push('');
  const riskNotes = plan.riskNotes || '';
  lines.push('| Risk | Likelihood | Impact | Mitigation |');
  lines.push('|---|---|---|---|');
  lines.push('| Claude API unavailable | Low | High | Keyword-fallback triage built into triageService |');
  lines.push('| GitLab wiki not enabled | Low | Medium | Enable wiki in GitLab project Settings → General |');
  lines.push('| JIRA API token expiry | Medium | High | Rotate token in `.env` and re-run affected phase |');
  lines.push('| Cucumber test timeout | Low | Medium | 5-minute kill timeout in runCucumber(); check port 3001 |');
  if (riskNotes) {
    lines.push(`| Additional risk | Medium | Medium | ${riskNotes} |`);
  }
  lines.push('');

  // ── 6. Success Criteria ───────────────────────────────────────────────────
  lines.push('## 6. Success Criteria');
  lines.push('');
  lines.push('- All JIRA epics and stories created and sprint-assigned');
  lines.push('- All 7 SDLC pipeline phases complete with HITL approval');
  lines.push('- Cucumber BDD scenarios: 100% pass rate');
  lines.push('- Application deployed to Render and health check passing');
  lines.push('- RunDetails.md generated with full audit trail');
  lines.push('');

  // ── 7. Approvals ──────────────────────────────────────────────────────────
  lines.push('## 7. Approvals');
  lines.push('');
  lines.push('| Gate | Phase | Status |');
  lines.push('|---|---|---|');
  lines.push('| HITL-1 | Requirement Analysis | ✅ Approved |');
  lines.push('| HITL-2 | Project Planning | ⏳ Pending |');
  lines.push('| HITL-3 | App Analysis | — |');
  lines.push('| HITL-4 | Design | — |');
  lines.push('| HITL-5 | Development | — |');
  lines.push('| HITL-6 | Testing | — |');
  lines.push('| HITL-7 | Deployment | — |');
  lines.push('| HITL-8 | Maintenance | — |');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`*Generated by CSTS Pipeline — Project Planning Agent · ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC*`);

  return lines.join('\n');
}

// ── MR description builder ─────────────────────────────────────────────────────

function buildMRDescription(analysisOutput, wikiUrl, milestones, issues, feedback) {
  const sprints  = analysisOutput.plan?.sprints || [];
  const totalPts = analysisOutput.plan?.totalStoryPoints ||
    sprints.flatMap(s => s.stories || []).reduce((a, x) => a + (x.points || 0), 0);
  const JIRA_BASE = (process.env.JIRA_BASE_URL || '').replace(/\/$/, '');
  const jiraLink  = key => JIRA_BASE ? `[${key}](${JIRA_BASE}/browse/${key})` : `\`${key}\``;

  const lines = [];
  lines.push(`## CSTS Project Plan — ${fmtDate()}`);
  lines.push('');
  lines.push('This MR adds the project plan document to `docs/project-plan.md`.');
  if (feedback) lines.push(`\n> **Revision note:** ${feedback}`);
  lines.push('');

  lines.push('### Summary');
  lines.push(`- **Sprints:** ${sprints.length}`);
  lines.push(`- **Total story points:** ${totalPts}`);
  lines.push(`- **Estimated duration:** ${analysisOutput.plan?.estimatedTotal || `${sprints.length * 2} weeks`}`);
  lines.push('');

  if (sprints.length > 0) {
    lines.push('### Sprint Breakdown');
    lines.push('| Sprint | Stories | Points |');
    lines.push('|---|---|---|');
    for (const s of sprints) {
      const name    = s.sprint || s.name || 'Sprint';
      const stories = (s.stories || []).map(x => jiraLink(typeof x === 'string' ? x : x.key)).join(', ');
      const pts     = (s.stories || []).reduce((a, x) => a + (x.points || 0), 0);
      lines.push(`| ${name} | ${stories || '—'} | ${pts} |`);
    }
    lines.push('');
  }

  lines.push('### GitLab Resources');
  if (wikiUrl)          lines.push(`- **Wiki:** [CSTS Project Plan — ${fmtDate()}](${wikiUrl})`);
  if (milestones.length) lines.push(`- **Milestones:** ${milestones.length} created`);
  if (issues.length)     lines.push(`- **Issues:** ${issues.length} created`);
  lines.push('');

  lines.push('---');
  lines.push(`> Generated by CSTS Pipeline — Project Planning Agent · ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC  `);
  lines.push('> **HITL Gate 2** — Approve this MR to proceed to App Analysis.');

  return lines.join('\n');
}

// ── Phase runner ───────────────────────────────────────────────────────────────

async function run({ feedback, state } = {}) {
  console.log('[project_planning] Project Planning Agent starting...');
  if (feedback) console.log(`[project_planning] Incorporating feedback: ${feedback}`);

  // ── Validate env vars ──────────────────────────────────────────────────────
  const missing = ['GITLAB_PAT', 'GITLAB_PROJECT_ID'].filter(k => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`[project_planning] Missing env vars: ${missing.join(', ')}. Add them to .env`);
  }

  // ── Read requirement_analysis output ──────────────────────────────────────
  const analysisOutput = state?.phaseOutputs?.requirement_analysis || {};
  const sprints        = analysisOutput.plan?.sprints || [];
  const totalPts       = analysisOutput.plan?.totalStoryPoints || 0;

  console.log(`[project_planning] Step 1/3 — Building project plan document...`);
  console.log(`[project_planning]   Epics:   ${(analysisOutput.epics   || []).length}`);
  console.log(`[project_planning]   Stories: ${(analysisOutput.stories || []).length}`);
  console.log(`[project_planning]   Sprints: ${sprints.length} (${totalPts} pts)`);

  const wikiTitle   = `CSTS Project Plan — ${fmtDate()}`;
  const planContent = buildPlanDocument(analysisOutput, feedback);

  // ── Publish to GitLab wiki ─────────────────────────────────────────────────
  console.log(`\n[project_planning] Step 2/3 — Publishing plan to GitLab wiki...`);
  console.log(`[project_planning]   Title: "${wikiTitle}"`);
  console.log(`[project_planning]   Project: ${process.env.GITLAB_PROJECT_ID}`);

  let wikiResult;
  try {
    wikiResult = await publishWikiPage(wikiTitle, planContent);
  } catch (err) {
    console.error(`[project_planning] GitLab publish failed: ${err.message}`);
    throw err;
  }

  // ── Create GitLab Milestones and Issues ───────────────────────────────────
  console.log(`\n[project_planning] Step 3/4 — Creating GitLab milestones and issues...`);
  const JIRA_BASE_URL = (process.env.JIRA_BASE_URL || '').replace(/\/$/, '');
  const createdMilestones = [];
  const createdIssues = [];

  if (sprints.length === 0) {
    console.warn('[project_planning]   No sprint data in requirement_analysis output — skipping milestone/issue creation.');
    console.warn('[project_planning]   Run the full pipeline from requirement_analysis to populate sprint data.');
  } else {
    for (const sprint of sprints) {
      const sprintName = sprint.sprint || sprint.name || 'Sprint';
      const milestoneDesc = [
        sprint.rationale            ? `**Rationale:** ${sprint.rationale}` : '',
        sprint.duration             ? `**Duration:** ${sprint.duration}` : '',
        sprint.dependencies?.length ? `**Dependencies:** ${sprint.dependencies.join(', ')}` : '',
        `\n_Generated by CSTS Pipeline — Project Planning Agent_`,
      ].filter(Boolean).join('\n');

      let milestone;
      try {
        milestone = await createMilestone(sprintName, milestoneDesc);
        createdMilestones.push(milestone);
      } catch (err) {
        console.warn(`[project_planning]   Milestone creation failed for "${sprintName}": ${err.message}`);
        continue;
      }

      for (const story of sprint.stories || []) {
        const key     = typeof story === 'string' ? story : story.key;
        const summary = story.summary  || '';
        const pts     = story.points   !== undefined ? story.points : '?';
        const pri     = story.priority || 'Medium';
        const jiraLink = JIRA_BASE_URL ? `[${key}](${JIRA_BASE_URL}/browse/${key})` : key;

        const issueTitle = summary ? `${key} — ${summary}` : key;
        const issueDesc  = [
          `**JIRA Story:** ${jiraLink}`,
          `**Sprint:** ${sprintName}`,
          `**Story Points:** ${pts}`,
          `**Priority:** ${pri}`,
          ``,
          `_Generated by CSTS Pipeline — Project Planning Agent_`,
        ].join('\n');

        try {
          const issue = await createIssue(issueTitle, issueDesc, milestone.id, [pri]);
          createdIssues.push(issue);
        } catch (err) {
          console.warn(`[project_planning]   Issue creation failed for "${key}": ${err.message}`);
        }
      }
    }
  }

  // ── Create branch, commit plan file, open MR ─────────────────────────────
  console.log(`\n[project_planning] Step 4/5 — Creating MR with plan document...`);
  const defaultBranch = process.env.GITLAB_DEFAULT_BRANCH || 'main';
  const planBranch    = `plan/csts-project-plan-${fmtDate()}`;
  const planFilePath  = 'docs/project-plan.md';
  let mrResult = null;

  try {
    await createBranch(planBranch, defaultBranch);
    await commitFile(
      planBranch,
      planFilePath,
      planContent,
      `docs: add CSTS project plan for ${fmtDate()}`
    );
    const mrTitle       = `Plan: CSTS Project Plan — ${fmtDate()}`;
    const mrDescription = buildMRDescription(analysisOutput, wikiResult.url, createdMilestones, createdIssues, feedback);
    const firstMilestoneId = createdMilestones.length > 0 ? createdMilestones[0].id : null;
    mrResult = await createMergeRequest(planBranch, defaultBranch, mrTitle, mrDescription, firstMilestoneId);
  } catch (err) {
    console.warn(`[project_planning]   MR creation failed: ${err.message}`);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n[project_planning] Step 5/5 — Plan published.`);
  console.log('[project_planning] ─────────────────────────────────────────────');
  console.log('[project_planning] PROJECT PLANNING COMPLETE');
  console.log(`[project_planning]   Wiki title  : ${wikiResult.title}`);
  console.log(`[project_planning]   Wiki URL    : ${wikiResult.url}`);
  console.log(`[project_planning]   Sprints     : ${sprints.length}`);
  console.log(`[project_planning]   Story pts   : ${totalPts}`);
  console.log(`[project_planning]   Milestones  : ${createdMilestones.length}`);
  console.log(`[project_planning]   Issues      : ${createdIssues.length}`);
  if (mrResult) {
    console.log(`[project_planning]   MR          : !${mrResult.iid} → ${mrResult.url}`);
  }
  console.log('[project_planning] HITL REVIEW REQUIRED — Review and approve the MR to proceed to App Analysis.');
  console.log('[project_planning] ─────────────────────────────────────────────');

  return {
    planDocUrl:       wikiResult.url,
    wikiSlug:         wikiResult.slug,
    wikiTitle:        wikiResult.title,
    sprints:          sprints.length,
    totalStoryPoints: totalPts,
    milestoneCount:   createdMilestones.length,
    milestones:       createdMilestones,
    issueCount:       createdIssues.length,
    issues:           createdIssues,
    mrUrl:            mrResult?.url  || null,
    mrIid:            mrResult?.iid  || null,
    branchName:       planBranch,
  };
}

module.exports = { run };

if (require.main === module) {
  run({ state: {} }).catch(err => {
    console.error('[project_planning] Failed:', err.message);
    process.exit(1);
  });
}
