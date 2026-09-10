require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const https = require('https');
const { addPRComment } = require('../hitl/reviewer');

const OWNER = process.env.GITHUB_OWNER;
const REPO  = process.env.GITHUB_REPO;
const PAT   = process.env.GITHUB_PAT;

function ghGet(apiPath) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: apiPath,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${PAT}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'CSTS-CodeReview',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function getPRFiles(prNumber) {
  const res = await ghGet(`/repos/${OWNER}/${REPO}/pulls/${prNumber}/files`);
  if (res.status !== 200) throw new Error(`GitHub returned ${res.status} fetching PR files`);
  return res.body; // [{ filename, status, patch, additions, deletions }]
}

// ── Static check patterns ──────────────────────────────────────────────────────
// Each entry is tested against the diff's added lines (+) only
const CHECKS = [
  {
    level: 'BLOCKER', category: 'Security',
    pattern: /require\s*\(\s*['"]better-sqlite3['"]\s*\)/,
    issue: 'Wrong database package: `better-sqlite3` used instead of `node:sqlite`',
    risk: 'Runtime failure — `better-sqlite3` is not installed in this project',
    fix: "Replace with `const { DatabaseSync } = require('node:sqlite')`",
  },
  {
    level: 'BLOCKER', category: 'Security',
    pattern: /process\.env\.\w+\s*\|\|\s*['"][^'"]{6,}['"]/,
    issue: 'Hardcoded secret fallback on env variable',
    risk: 'Fallback value may be committed and leak credentials',
    fix: 'Remove the `|| "fallback"` — throw if the variable is missing',
  },
  {
    level: 'BLOCKER', category: 'Security',
    pattern: /\beval\s*\(|new\s+Function\s*\(/,
    issue: '`eval()` or `new Function()` detected',
    risk: 'Remote code execution if any user-controlled data reaches this call',
    fix: 'Eliminate dynamic code evaluation; use a static lookup or switch instead',
  },
  {
    level: 'BLOCKER', category: 'Security',
    pattern: /res\.(json|send)\s*\(\s*\{[^}]*\bstack\b/,
    issue: 'Stack trace included in HTTP error response',
    risk: 'Exposes internal file paths and dependency tree to clients',
    fix: 'Return only `{ error: string }` — log the full error server-side',
  },
  {
    level: 'MAJOR', category: 'Quality',
    pattern: /console\.(log|debug|info)\s*\(/,
    issue: '`console.log/debug/info` in production path',
    risk: 'Noisy logs in production; potential PII leakage',
    fix: 'Remove debug logs or replace with a structured logger',
  },
  {
    level: 'MAJOR', category: 'Standards',
    pattern: /db\.(query|exec)\s*\(\s*[`'"]\s*SELECT|INSERT|UPDATE|DELETE/i,
    issue: 'Raw SQL string passed directly to `db.query/exec`',
    risk: 'SQL injection if any variable is interpolated without binding',
    fix: 'Use `.prepare(sql).run(params)` with bound parameters',
  },
  {
    level: 'MINOR', category: 'Standards',
    pattern: /<(button|input|select|textarea)[^>]*(?!data-testid)[^>]*>/,
    issue: 'Interactive element may be missing `data-testid` attribute',
    risk: 'Playwright tests cannot reliably target this element',
    fix: 'Add `data-testid="<component>-<action>"` to the element',
  },
  {
    level: 'MINOR', category: 'Standards',
    pattern: /require\s*\(\s*['"]better-sqlite3['"]\s*\)/,
    issue: 'Duplicate check guard — should have been caught by BLOCKER above',
    risk: 'N/A',
    fix: 'N/A',
  },
];

// Filter out duplicate patterns (the BLOCKER for better-sqlite3 already covers it)
const ACTIVE_CHECKS = CHECKS.filter((c, i) =>
  !CHECKS.slice(0, i).some(prev => prev.pattern.source === c.pattern.source)
);

function scanFiles(files) {
  const findings = [];
  const seen = new Set();

  for (const file of files) {
    if (!file.patch) continue;

    // Only examine added lines (lines starting with +, not +++)
    const addedLines = file.patch
      .split('\n')
      .filter(l => l.startsWith('+') && !l.startsWith('+++'))
      .map(l => l.slice(1)); // strip the leading +

    const addedContent = addedLines.join('\n');

    for (const check of ACTIVE_CHECKS) {
      const dedupeKey = `${check.pattern.source}::${file.filename}`;
      if (seen.has(dedupeKey)) continue;
      if (check.pattern.test(addedContent)) {
        seen.add(dedupeKey);
        findings.push({
          level: check.level,
          category: check.category,
          file: file.filename,
          issue: check.issue,
          risk: check.risk,
          fix: check.fix,
        });
      }
    }
  }

  return findings;
}

function count(arr, level, category) {
  return arr.filter(f => f.level === level && f.category === category).length;
}

function buildReviewComment(prNumber, findings) {
  const blockers = findings.filter(f => f.level === 'BLOCKER');
  const majors   = findings.filter(f => f.level === 'MAJOR');
  const minors   = findings.filter(f => f.level === 'MINOR');

  const verdict = blockers.length > 0 || majors.length > 0
    ? 'REQUEST CHANGES'
    : 'APPROVE';

  const lines = [
    `## Code Review Summary — PR #${prNumber}`,
    '',
    '| Category | Blockers | Majors | Minors |',
    '|---|:---:|:---:|:---:|',
    `| Security  | ${count(blockers,'BLOCKER','Security')+count(majors,'MAJOR','Security')+count(minors,'MINOR','Security') > 0 ? blockers.filter(f=>f.category==='Security').length : 0} | ${majors.filter(f=>f.category==='Security').length} | ${minors.filter(f=>f.category==='Security').length} |`,
    `| Quality   | ${blockers.filter(f=>f.category==='Quality').length} | ${majors.filter(f=>f.category==='Quality').length} | ${minors.filter(f=>f.category==='Quality').length} |`,
    `| Standards | ${blockers.filter(f=>f.category==='Standards').length} | ${majors.filter(f=>f.category==='Standards').length} | ${minors.filter(f=>f.category==='Standards').length} |`,
    '',
    `**Verdict:** ${verdict}  `,
    findings.length === 0
      ? '**Rationale:** No issues found — code meets all project standards.'
      : `**Rationale:** ${blockers.length} blocker(s), ${majors.length} major(s), ${minors.length} minor(s) detected.`,
    '',
  ];

  if (findings.length > 0) {
    lines.push('---', '', '### Findings', '');
    for (const f of findings) {
      lines.push(
        `**[${f.level}]** — ${f.category}  `,
        `File: \`${f.file}\``,
        '',
        `**Issue:** ${f.issue}  `,
        `**Risk:** ${f.risk}  `,
        `**Fix:** ${f.fix}`,
        '',
        '---',
        '',
      );
    }
  }

  lines.push(
    '> 🤖 Automated review by CSTS Code Review Agent',
    `> HITL REVIEW REQUIRED — Review posted on PR #${prNumber}. Human must approve or request further changes.`,
  );

  return lines.join('\n');
}

/**
 * Run automated code review on a GitHub PR.
 * Posts a structured comment with findings and returns a summary.
 *
 * @param {number} prNumber
 * @returns {{ verdict: string, blockers: number, majors: number, minors: number, findings: number, reviewCommentUrl: string|null }}
 */
async function reviewPR(prNumber) {
  console.log(`[code-review] Starting automated review for PR #${prNumber}...`);

  let files;
  try {
    files = await getPRFiles(prNumber);
    console.log(`[code-review] Scanning ${files.length} changed file(s)...`);
  } catch (err) {
    console.warn(`[code-review] Could not fetch PR files: ${err.message} — review skipped`);
    return { verdict: 'SKIPPED', blockers: 0, majors: 0, minors: 0, findings: 0, reviewCommentUrl: null };
  }

  const findings = scanFiles(files);
  const blockers = findings.filter(f => f.level === 'BLOCKER').length;
  const majors   = findings.filter(f => f.level === 'MAJOR').length;
  const minors   = findings.filter(f => f.level === 'MINOR').length;
  const verdict  = blockers > 0 || majors > 0 ? 'REQUEST CHANGES' : 'APPROVE';

  console.log(`[code-review] Findings: ${blockers} blocker(s), ${majors} major(s), ${minors} minor(s) — verdict: ${verdict}`);

  const commentBody = buildReviewComment(prNumber, findings);
  let reviewCommentUrl = null;
  try {
    const posted = await addPRComment(prNumber, commentBody);
    reviewCommentUrl = posted.html_url;
    console.log(`[code-review] Review posted → ${reviewCommentUrl}`);
  } catch (err) {
    console.warn(`[code-review] Failed to post review comment: ${err.message}`);
  }

  return { verdict, blockers, majors, minors, findings: findings.length, reviewCommentUrl };
}

module.exports = { reviewPR };
