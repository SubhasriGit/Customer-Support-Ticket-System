require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs   = require('fs');
const path = require('path');

const JIRA_BASE    = process.env.JIRA_BASE_URL          || 'https://subhasree.atlassian.net';
const CONF_BASE    = process.env.CONFLUENCE_BASE_URL     || 'https://subhasree.atlassian.net/wiki';
const GH_OWNER     = process.env.GITHUB_OWNER;
const GH_REPO      = process.env.GITHUB_REPO;

const STATUS_ICON = {
  approved:           '✅ Approved',
  changes_requested:  '🔁 Revised & Approved',
  timeout:            '⏱️ Timed Out',
  skipped:            '⏭️ Not Run',
  in_progress:        '🔄 In Progress',
};

function jiraLink(key)       { return `[${key}](${JIRA_BASE}/browse/${key})`; }
function confLink(label, id) { return `[${label}](${CONF_BASE}/pages/${id})`; }
function ghLink(label, url)  { return `[${label}](${url})`; }
function localLink(label, p) { return `\`${label}: ${p}\``; }

function extractLinks(phaseName, output = {}) {
  const links = [];

  switch (phaseName) {
    case 'requirement_analysis':
      (output.epics   || []).forEach(k => links.push(jiraLink(k)));
      (output.stories || []).forEach(k => links.push(jiraLink(k)));
      if (output.plan?.sprints?.length) {
        links.push(`\`Sprint plan: ${output.plan.sprints.length} sprints / ${output.plan.totalStoryPoints} pts\``);
      }
      break;

    case 'app_analysis':
      if (output.confluenceUrl) links.push(ghLink('Confluence Gap Report', output.confluenceUrl));
      if (Array.isArray(output.jiraTasks)) {
        output.jiraTasks.forEach(k => links.push(jiraLink(k)));
      }
      if (output.gaps?.length) links.push(`\`${output.gaps.length} gap(s) identified\``);
      break;

    case 'design':
      if (output.confluenceUrl) links.push(ghLink('Confluence Architecture', output.confluenceUrl));
      if (output.hld)       links.push(confLink('Confluence HLD',       output.hld));
      if (output.lld)       links.push(confLink('Confluence LLD',       output.lld));
      if (output.wireframes) links.push(confLink('Confluence Wireframes', output.wireframes));
      break;

    case 'development':
      if (output.prUrl)  links.push(ghLink(`GitHub PR #${output.prNumber}`, output.prUrl));
      if (output.branch) links.push(ghLink(`Branch: ${output.branch}`, `https://github.com/${GH_OWNER}/${GH_REPO}/tree/${output.branch}`));
      break;

    case 'testing': {
      const reportHtml = path.join('tests', 'cucumber-report', 'report.html');
      const reportJson = path.join('tests', 'cucumber-report', 'report.json');
      links.push(localLink('Cucumber HTML report', reportHtml));
      links.push(localLink('Cucumber JSON report', reportJson));
      if (output.totalScen !== undefined) {
        links.push(`\`${output.passedScen}/${output.totalScen} scenarios passed\``);
      }
      if (output.healed) links.push(`\`${output.healed} selector(s) self-healed\``);
      break;
    }

    case 'deployment':
      if (output.confluenceUrl) links.push(ghLink('Confluence FRD', output.confluenceUrl));
      if (output.frdId)         links.push(confLink('Confluence API Docs', output.frdId));
      if (GH_OWNER && GH_REPO)  links.push(ghLink('README.md', `https://github.com/${GH_OWNER}/${GH_REPO}/blob/main/README.md`));
      if (output.artifactPath)  links.push(localLink('Artifact', output.artifactPath));
      break;

    case 'maintenance':
      if (output.jiraKey)   links.push(jiraLink(output.jiraKey));
      if (output.confPageId) links.push(confLink('Confluence Runbook', output.confPageId));
      if (output.renderUrl) links.push(ghLink('Render Deployment', output.renderUrl));
      if (output.healthStatus) links.push(`\`Health: ${output.healthStatus}\``);
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

function generateRunDetails(state, startedAt) {
  const PHASES = [
    'requirement_analysis',
    'app_analysis',
    'design',
    'development',
    'testing',
    'deployment',
    'maintenance',
  ];

  const finishedAt  = new Date();
  const durationMin = startedAt ? Math.round((finishedAt - startedAt) / 60000) : '?';
  const completed   = state.completedPhases?.length || 0;

  const rows = PHASES.map(phase => {
    const output = state.phaseOutputs?.[phase] || {};
    const status = phaseStatus(phase, state);
    const links  = extractLinks(phase, output);
    const linkCell = links.length ? links.join('<br>') : '—';
    const label    = phase.replace(/_/g, '\\_');
    return `| ${label} | ${status} | ${linkCell} |`;
  });

  return [
    '# CSTS Pipeline — Run Details',
    '',
    `| | |`,
    `|---|---|`,
    `| **Started**   | ${fmtDate(startedAt)} |`,
    `| **Completed** | ${fmtDate(finishedAt)} |`,
    `| **Duration**  | ~${durationMin} min |`,
    `| **Phases completed** | ${completed} / ${PHASES.length} |`,
    '',
    '## Phase Summary',
    '',
    '| Phase | Status | Links Created / Modified |',
    '|---|---|---|',
    ...rows,
    '',
    '---',
    `*Generated by CSTS pipeline orchestrator on ${fmtDate(finishedAt)}*`,
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
