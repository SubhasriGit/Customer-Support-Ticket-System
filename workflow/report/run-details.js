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
  requirement_analysis: { num: 1, icon: '📋', label: 'Requirement Analysis', agent: 'BA Agent'         },
  app_analysis:         { num: 2, icon: '🔍', label: 'App Analysis',         agent: 'Analyst Agent'    },
  design:               { num: 3, icon: '🎨', label: 'Design',               agent: 'Architect Agent'  },
  development:          { num: 4, icon: '💻', label: 'Development',          agent: 'Dev Agent'        },
  testing:              { num: 5, icon: '🧪', label: 'Testing',              agent: 'QA Agent'         },
  deployment:           { num: 6, icon: '🚀', label: 'Deployment',           agent: 'DevOps Agent'     },
  maintenance:          { num: 7, icon: '🔧', label: 'Maintenance',          agent: 'SRE Agent'        },
};

const STATUS_ICON = {
  approved:          '✅ Approved',
  changes_requested: '🔁 Revised',
  timeout:           '⏱️ Timed Out',
  skipped:           '⏭️ Skipped',
  in_progress:       '🔄 In Progress',
};

// ── Link helpers ───────────────────────────────────────────────────────────────
function jiraLink(key)       { return JIRA_BASE ? `[${key}](${JIRA_BASE}/browse/${key})` : key; }
function confLink(label, id) {
  const spaceSeg = CONF_SPACE ? `/spaces/${CONF_SPACE}` : '';
  return CONF_BASE ? `[${label}](${CONF_BASE}${spaceSeg}/pages/${id})` : label;
}
function ghLink(label, url)  { return `[${label}](${url})`; }

// ── Per-phase artifact extraction ──────────────────────────────────────────────
function extractLinks(phaseName, output = {}) {
  const links = [];

  switch (phaseName) {
    case 'requirement_analysis':
      (output.epics   || []).forEach(k => links.push(jiraLink(k)));
      (output.stories || []).forEach(k => links.push(jiraLink(k)));
      if (output.plan?.sprints?.length) {
        links.push(`\`${output.plan.sprints.length} sprints · ${output.plan.totalStoryPoints} pts\``);
      }
      break;

    case 'app_analysis':
      if (output.confluenceUrl) links.push(ghLink('📄 Gap Report', output.confluenceUrl));
      (output.jiraTasks || []).forEach(k => links.push(jiraLink(k)));
      if (output.gaps?.length)  links.push(`\`${output.gaps.length} gap(s) found\``);
      break;

    case 'design':
      if (output.confluenceUrl) links.push(ghLink('🏗️ Architecture', output.confluenceUrl));
      if (output.hld)           links.push(confLink('HLD', output.hld));
      if (output.lld)           links.push(confLink('LLD', output.lld));
      if (output.wireframes)    links.push(confLink('Wireframes', output.wireframes));
      break;

    case 'development':
      if (output.prUrl)  links.push(ghLink(`🔀 PR #${output.prNumber}`, output.prUrl));
      if (output.branch && GH_OWNER && GH_REPO) {
        links.push(ghLink(`🌿 ${output.branch}`, `https://github.com/${GH_OWNER}/${GH_REPO}/tree/${output.branch}`));
      }
      break;

    case 'testing': {
      if (output.totalScen !== undefined) {
        const icon = parseInt(output.failedScen) > 0 ? '❌' : '✅';
        links.push(`\`${icon} ${output.passedScen}/${output.totalScen} scenarios passed\``);
      }
      if (output.healed) links.push(`\`🩹 ${output.healed} selector(s) healed\``);
      const htmlReport = path.join('tests', 'cucumber-report', 'report.html');
      links.push(`\`📊 ${htmlReport}\``);
      break;
    }

    case 'deployment':
      if (output.deployUrl)     links.push(ghLink('🌐 Live Site', output.deployUrl));
      if (output.confluenceUrl) links.push(ghLink('📄 FRD', output.confluenceUrl));
      if (output.frdId)         links.push(confLink('API Docs', output.frdId));
      if (GH_OWNER && GH_REPO)  links.push(ghLink('📘 README', `https://github.com/${GH_OWNER}/${GH_REPO}/blob/main/README.md`));
      if (output.artifactPath)  links.push(`\`📦 ${output.artifactPath}\``);
      break;

    case 'maintenance':
      if (output.jiraKey)    links.push(jiraLink(output.jiraKey));
      if (output.confPageId) links.push(confLink('📖 Runbook', output.confPageId));
      if (output.renderUrl)  links.push(ghLink('🌐 Render', output.renderUrl));
      if (output.healthStatus) {
        const hIcon = output.healthStatus === 'healthy' ? '💚' : '🔴';
        links.push(`\`${hIcon} Health: ${output.healthStatus}\``);
      }
      break;
  }

  return links;
}

function phaseStatus(phaseName, state) {
  if (state.completedPhases?.includes(phaseName)) {
    const decision = state.hitlDecisions?.[phaseName]?.decision || 'approved';
    return STATUS_ICON[decision] || '✅ Done';
  }
  if (state.currentPhase === phaseName) return STATUS_ICON.in_progress;
  return STATUS_ICON.skipped;
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

// ── Highlights section ─────────────────────────────────────────────────────────
function buildHighlights(state) {
  const lines = [];
  const out   = state.phaseOutputs || {};

  // Jira items created
  const epics   = out.requirement_analysis?.epics   || [];
  const stories = out.requirement_analysis?.stories || [];
  if (epics.length + stories.length > 0) {
    lines.push(`- **JIRA**: ${epics.length} epic(s), ${stories.length} story(ies) created`);
  }

  // Sprint plan
  const plan = out.requirement_analysis?.plan;
  if (plan?.sprints?.length) {
    lines.push(`- **Sprint plan**: ${plan.sprints.length} sprints · ${plan.totalStoryPoints} story points`);
  }

  // PR
  const pr = out.development;
  if (pr?.prUrl) lines.push(`- **PR**: [#${pr.prNumber}](${pr.prUrl}) → ${pr.branch || ''}`);

  // Test results
  const qa = out.testing;
  if (qa?.totalScen !== undefined) {
    lines.push(`- **Tests**: ${qa.passedScen}/${qa.totalScen} scenarios passed`);
  }

  // Live URL
  const dep = out.deployment || out.build;
  if (dep?.deployUrl) lines.push(`- **Live URL**: ${dep.deployUrl}`);

  return lines.length ? lines.join('\n') : '- *(no highlights available)*';
}

// ── Main generator ─────────────────────────────────────────────────────────────
function generateRunDetails(state, startedAt) {
  const PHASES    = Object.keys(PHASE_META);
  const finishedAt  = new Date();
  const completed   = state.completedPhases?.length || 0;
  const allPassed   = completed === PHASES.length;
  const resultBadge = allPassed ? '✅ All phases completed' : `⚠️ ${completed}/${PHASES.length} phases completed`;

  // ── Phase table rows
  const rows = PHASES.map(phase => {
    const meta   = PHASE_META[phase];
    const output = state.phaseOutputs?.[phase] || {};
    const status = phaseStatus(phase, state);
    const links  = extractLinks(phase, output);
    const linkCell = links.length ? links.join(' · ') : '—';
    return `| ${meta.num} | ${meta.icon} **${meta.label}** | ${meta.agent} | ${status} | ${linkCell} |`;
  });

  return [
    '# 🚀 CSTS Pipeline — Run Report',
    '',
    '---',
    '',
    '## 📋 Run Summary',
    '',
    '| | |',
    '|:--|:--|',
    `| 🕐 **Started**    | ${fmtDate(startedAt)} |`,
    `| 🏁 **Completed**  | ${fmtDate(finishedAt)} |`,
    `| ⏱️ **Duration**   | ${fmtDuration(startedAt, finishedAt)} |`,
    `| 📊 **Result**     | ${resultBadge} |`,
    '',
    '---',
    '',
    '## 🗂️ Phase Results',
    '',
    '| # | Phase | Agent | Status | Artifacts & Links |',
    '|:-:|:------|:------|:------:|:------------------|',
    ...rows,
    '',
    '---',
    '',
    '## 🎯 Highlights',
    '',
    buildHighlights(state),
    '',
    '---',
    '',
    `*Generated by CSTS Pipeline Orchestrator · ${fmtDate(finishedAt)}*`,
  ].join('\n');
}

function writeRunDetails(state, startedAt) {
  const outPath = path.join(__dirname, '../../RunDetails.md');
  const content = generateRunDetails(state, startedAt);
  fs.writeFileSync(outPath, content, 'utf8');
  console.log(`\n[Report] ✅ RunDetails.md written → ${outPath}`);
  return outPath;
}

module.exports = { writeRunDetails };
