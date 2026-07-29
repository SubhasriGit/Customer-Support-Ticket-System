require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs   = require('fs');
const path = require('path');

const JIRA_BASE  = (process.env.JIRA_BASE_URL         || '').replace(/\/$/, '');
const CONF_BASE  = (process.env.CONFLUENCE_BASE_URL   || '').replace(/\/$/, '');
const CONF_SPACE = process.env.CONFLUENCE_SPACE_KEY   || '';
const GH_OWNER   = process.env.GITHUB_OWNER;
const GH_REPO    = process.env.GITHUB_REPO;

if (!JIRA_BASE)  console.warn('[run-details] JIRA_BASE_URL not set — JIRA links will be omitted');
if (!CONF_BASE)  console.warn('[run-details] CONFLUENCE_BASE_URL not set — Confluence links will be omitted');

// ── Phase metadata ─────────────────────────────────────────────────────────────
const PHASE_META = {
  requirement_analysis: { num: 1, icon: '📋', label: 'Requirement Analysis', agent: 'BA Agent',       desc: 'Parses requirements, creates Jira epic/story hierarchy and sprint plan.' },
  project_planning:     { num: 2, icon: '📅', label: 'Project Planning',     agent: 'Planning Agent', desc: 'Builds formal project plan from JIRA output and publishes to GitLab wiki.' },
  app_analysis:         { num: 3, icon: '🔍', label: 'App Analysis',         agent: 'Analyst Agent',  desc: 'Analyses the existing app, identifies gaps and creates improvement tasks.' },
  design:               { num: 4, icon: '🎨', label: 'Design',               agent: 'Architect Agent', desc: 'Produces HLD, LLD and wireframes, published to Confluence.' },
  development:          { num: 5, icon: '💻', label: 'Development',          agent: 'Dev Agent',      desc: 'Implements features on a feature branch and opens a GitHub PR.' },
  documentation:        { num: 6, icon: '📝', label: 'Documentation',        agent: 'DocWriter Agent',desc: 'Publishes FRD, Architecture, HLD, LLD, Wireframes to Confluence and commits README.md.' },
  testing:              { num: 7, icon: '🧪', label: 'Testing',              agent: 'QA Agent',       desc: 'Runs Playwright/Cucumber BDD scenarios with self-healing selectors.' },
  deployment:           { num: 8, icon: '🚀', label: 'Deployment',           agent: 'DevOps Agent',   desc: 'Builds the artifact, deploys to Render and publishes FRD to Confluence.' },
  maintenance:          { num: 9, icon: '🔧', label: 'Maintenance',          agent: 'SRE Agent',      desc: 'Creates a Jira maintenance ticket and updates the Confluence runbook.' },
};

const STATUS_LABEL = {
  approved:          '✅ Approved',
  changes_requested: '🔁 Revised & Approved',
  timeout:           '⏱️ Timed Out',
  skipped:           '⏭️ Skipped',
  in_progress:       '🔄 In Progress',
};

// ── Link helpers ───────────────────────────────────────────────────────────────
function jiraLink(key)       { return JIRA_BASE ? `[${key}](${JIRA_BASE}/browse/${key})` : `\`${key}\``; }
function confLink(label, id) {
  const spaceSeg = CONF_SPACE ? `/spaces/${CONF_SPACE}` : '';
  return CONF_BASE ? `[${label}](${CONF_BASE}${spaceSeg}/pages/${id})` : `\`${label}\``;
}
function ghLink(label, url)  { return `[${label}](${url})`; }

// ── Per-phase artifact bullets ─────────────────────────────────────────────────
function extractArtifacts(phaseName, output = {}) {
  const items = [];

  switch (phaseName) {
    case 'requirement_analysis':
      (output.epics   || []).forEach(k => items.push(`${jiraLink(k)} — Epic`));
      (output.stories || []).forEach(k => items.push(`${jiraLink(k)} — Story`));
      if (output.plan?.sprints?.length) {
        items.push(`📅 Sprint plan: **${output.plan.sprints.length} sprints** · **${output.plan.totalStoryPoints} story points**`);
        (output.plan.sprints || []).forEach((s, i) => {
          if (s.name) items.push(`  - Sprint ${i + 1}: ${s.name}${s.storyPoints ? ` (${s.storyPoints} pts)` : ''}`);
        });
      }
      break;

    case 'project_planning':
      if (output.mrUrl)        items.push(`🔀 ${ghLink(`MR !${output.mrIid} — CSTS Project Plan`, output.mrUrl)}`);
      if (output.planDocUrl)   items.push(`📄 ${ghLink('GitLab Wiki Plan', output.planDocUrl)}`);
      if (output.milestoneCount) items.push(`🏁 **${output.milestoneCount} milestone(s)** created`);
      if (output.issueCount)     items.push(`🎫 **${output.issueCount} issue(s)** created`);
      if (output.sprints)        items.push(`📅 **${output.sprints} sprint(s)** · **${output.totalStoryPoints || 0} story points**`);
      break;

    case 'app_analysis':
      if (output.confluenceUrl) items.push(`📄 ${ghLink('Gap Report', output.confluenceUrl)}`);
      (output.jiraTasks || []).forEach(k => items.push(`${jiraLink(k)} — Task`));
      if (output.gaps?.length)  items.push(`🔎 **${output.gaps.length} gap(s)** identified`);
      break;

    case 'design':
      if (output.confluenceUrl) items.push(`🏗️ ${ghLink('Architecture Document', output.confluenceUrl)}`);
      if (output.hld)           items.push(`📐 ${confLink('High-Level Design (HLD)', output.hld)}`);
      if (output.lld)           items.push(`🔩 ${confLink('Low-Level Design (LLD)', output.lld)}`);
      if (output.wireframes)    items.push(`🖼️ ${confLink('Wireframes', output.wireframes)}`);
      break;

    case 'development':
      if (output.prUrl)  items.push(`🔀 ${ghLink(`Pull Request #${output.prNumber}`, output.prUrl)}`);
      if (output.branch && GH_OWNER && GH_REPO) {
        items.push(`🌿 ${ghLink(`Branch: ${output.branch}`, `https://github.com/${GH_OWNER}/${GH_REPO}/tree/${output.branch}`)}`);
      }
      if (output.review && output.review.verdict !== 'SKIPPED') {
        const rv = output.review;
        const icon = rv.verdict === 'APPROVE' ? '✅' : '⚠️';
        items.push(`${icon} **Code Review:** ${rv.verdict} · ${rv.blockers} blocker(s) · ${rv.majors} major(s) · ${rv.minors} minor(s)`);
        if (rv.reviewCommentUrl) items.push(`💬 ${ghLink('Review Comment', rv.reviewCommentUrl)}`);
      }
      break;

    case 'documentation':
      if (output.frdUrl)          items.push(`📋 ${ghLink('Functional Requirements Document (FRD)', output.frdUrl)}`);
      if (output.architectureUrl) items.push(`🏗️ ${ghLink('Architecture Document', output.architectureUrl)}`);
      if (output.hldUrl)          items.push(`📐 ${ghLink('High Level Design (HLD)', output.hldUrl)}`);
      if (output.lldUrl)          items.push(`🔩 ${ghLink('Low Level Design (LLD)', output.lldUrl)}`);
      if (output.wireframesUrl)   items.push(`🖼️ ${ghLink('Wireframes', output.wireframesUrl)}`);
      if (output.readmeUrl)       items.push(`📖 ${ghLink('README.md (committed to repo)', output.readmeUrl)}`);
      break;

    case 'testing': {
      const passed = parseInt(output.passedScen) || 0;
      const total  = parseInt(output.totalScen)  || 0;
      const failed = parseInt(output.failedScen) || 0;
      if (total > 0) {
        const icon = failed > 0 ? '❌' : '✅';
        items.push(`${icon} **${passed}/${total} scenarios passed**${failed > 0 ? ` · ${failed} failed` : ''}`);
      }
      if (output.healed) items.push(`🩹 **${output.healed}** selector(s) auto-healed`);
      items.push(`📊 Report: \`tests/cucumber-report/report.html\``);
      break;
    }

    case 'deployment':
      if (output.deployUrl)     items.push(`🌐 **${ghLink('Live Site', output.deployUrl)}**`);
      if (output.confluenceUrl) items.push(`📄 ${ghLink('Functional Requirements Document (FRD)', output.confluenceUrl)}`);
      if (output.frdId)         items.push(`📘 ${confLink('API Documentation', output.frdId)}`);
      if (GH_OWNER && GH_REPO)  items.push(`📖 ${ghLink('README.md', `https://github.com/${GH_OWNER}/${GH_REPO}/blob/main/README.md`)}`);
      if (output.artifactPath)  items.push(`📦 Artifact: \`${output.artifactPath}\``);
      break;

    case 'maintenance':
      if (output.jiraKey)    items.push(`${jiraLink(output.jiraKey)} — Maintenance Ticket`);
      if (output.confPageId) items.push(`📖 ${confLink('Runbook', output.confPageId)}`);
      if (output.renderUrl)  items.push(`🌐 ${ghLink('Render Deployment', output.renderUrl)}`);
      if (output.healthStatus) {
        const hIcon = output.healthStatus === 'healthy' ? '💚' : '🔴';
        items.push(`${hIcon} Health check: **${output.healthStatus}**`);
      }
      break;
  }

  return items;
}

function phaseStatus(phaseName, state) {
  if (state.completedPhases?.includes(phaseName)) {
    const decision = state.hitlDecisions?.[phaseName]?.decision || 'approved';
    return STATUS_LABEL[decision] || '✅ Done';
  }
  if (state.currentPhase === phaseName) return STATUS_LABEL.in_progress;
  return STATUS_LABEL.skipped;
}

function fmtDate(d) {
  return d ? d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '—';
}

function fmtDuration(startedAt, finishedAt) {
  if (!startedAt) return '—';
  const ms  = finishedAt - startedAt;
  const min = Math.floor(ms / 60000);
  const sec = Math.round((ms % 60000) / 1000);
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

// ── Phase section ──────────────────────────────────────────────────────────────
function buildPhaseSection(phaseName, state) {
  const meta      = PHASE_META[phaseName];
  const output    = state.phaseOutputs?.[phaseName] || {};
  const status    = phaseStatus(phaseName, state);
  const artifacts = extractArtifacts(phaseName, output);
  const feedback  = state.hitlDecisions?.[phaseName]?.feedback;

  const lines = [
    `### ${meta.icon} Phase ${meta.num} — ${meta.label}`,
    '',
    `**Agent:** ${meta.agent} &nbsp;·&nbsp; **Status:** ${status}`,
    '',
    `> ${meta.desc}`,
    '',
  ];

  if (artifacts.length > 0) {
    lines.push('**Artifacts & Links**');
    lines.push('');
    artifacts.forEach(a => lines.push(`- ${a}`));
    lines.push('');
  } else {
    lines.push('*No artifacts recorded for this phase.*');
    lines.push('');
  }

  if (feedback) {
    lines.push(`> 💬 **HITL Feedback:** ${feedback}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ── Highlights section ─────────────────────────────────────────────────────────
function buildHighlights(state) {
  const lines = [];
  const out   = state.phaseOutputs || {};

  const epics   = out.requirement_analysis?.epics   || [];
  const stories = out.requirement_analysis?.stories || [];
  if (epics.length + stories.length > 0)
    lines.push(`🗂️ **JIRA items created:** ${epics.length} epic(s) · ${stories.length} story(ies)`);

  const plan = out.requirement_analysis?.plan;
  if (plan?.sprints?.length)
    lines.push(`📅 **Sprint plan:** ${plan.sprints.length} sprints · ${plan.totalStoryPoints} story points`);

  const pp = out.project_planning;
  if (pp?.mrUrl)
    lines.push(`🔀 **Plan MR:** ${ghLink(`!${pp.mrIid}`, pp.mrUrl)} → \`${pp.branchName || ''}\``);

  const pr = out.development;
  if (pr?.prUrl)
    lines.push(`🔀 **Dev PR:** ${ghLink(`#${pr.prNumber}`, pr.prUrl)} → \`${pr.branch || ''}\``);
  if (pr?.review && pr.review.verdict !== 'SKIPPED') {
    const rv = pr.review;
    const icon = rv.verdict === 'APPROVE' ? '✅' : '⚠️';
    lines.push(`${icon} **Code Review:** ${rv.verdict} — ${rv.blockers}B / ${rv.majors}M / ${rv.minors}m`);
  }

  const docs = out.documentation;
  if (docs?.frdUrl)
    lines.push(`📋 **FRD:** ${ghLink('Functional Requirements Document', docs.frdUrl)}`);
  if (docs?.architectureUrl)
    lines.push(`🏗️ **Architecture:** ${ghLink('Confluence Architecture Doc', docs.architectureUrl)}`);
  if (docs?.readmeUrl)
    lines.push(`📖 **README:** ${ghLink('README.md committed', docs.readmeUrl)} → \`${docs.branch || ''}\``);

  const qa = out.testing;
  if (qa?.totalScen !== undefined) {
    const icon = parseInt(qa.failedScen) > 0 ? '❌' : '✅';
    lines.push(`${icon} **Test results:** ${qa.passedScen}/${qa.totalScen} scenarios passed`);
  }

  const dep = out.deployment || out.build;
  if (dep?.deployUrl)
    lines.push(`🌐 **Live URL:** ${dep.deployUrl}`);

  return lines.length
    ? lines.join('  \n')
    : '*No highlights available.*';
}

// ── Main generator ─────────────────────────────────────────────────────────────
function generateRunDetails(state, startedAt) {
  const PHASES      = Object.keys(PHASE_META);
  const finishedAt  = new Date();
  const completed   = state.completedPhases?.length || 0;
  const allPassed   = completed === PHASES.length;
  const resultBadge = allPassed
    ? `✅ **All ${PHASES.length} phases completed successfully**`
    : `⚠️ **${completed} / ${PHASES.length} phases completed**`;

  const phaseSections = PHASES.map(p => buildPhaseSection(p, state)).join('---\n\n');

  return [
    '# 🚀 CSTS Pipeline — Run Report',
    '',
    '> **Project:** Customer Support Ticket System &nbsp;·&nbsp; **Pipeline:** AI-Driven SDLC',
    '',
    '---',
    '',
    '## 📋 Run Summary',
    '',
    `🕐 **Started:** &nbsp; ${fmtDate(startedAt)}  `,
    `🏁 **Completed:** &nbsp; ${fmtDate(finishedAt)}  `,
    `⏱️ **Duration:** &nbsp; ${fmtDuration(startedAt, finishedAt)}  `,
    `📊 **Result:** &nbsp; ${resultBadge}  `,
    '',
    '---',
    '',
    '## 🎯 Highlights',
    '',
    buildHighlights(state),
    '',
    '---',
    '',
    '## 🗂️ Phase Details',
    '',
    phaseSections,
    '---',
    '',
    `*Generated by CSTS Pipeline Orchestrator · ${fmtDate(finishedAt)}*`,
  ].join('\n');
}

function writeRunDetails(state, startedAt) {
  const ts      = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15); // YYYYMMDDHHmmss (no ms)
  const outPath = path.join(__dirname, `../../RunDetails${ts}.md`);
  const content = generateRunDetails(state, startedAt);
  fs.writeFileSync(outPath, content, 'utf8');
  console.log(`\n[Report] ✅ RunDetails${ts}.md written → ${outPath}`);
  return outPath;
}

module.exports = { writeRunDetails };
