require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const https = require('https');

const GITHUB_API = 'api.github.com';
const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const PAT = process.env.GITHUB_PAT;

function githubRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: GITHUB_API,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${PAT}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'CSTS-Orchestrator',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function createPR({ branch, title, body, base = 'main' }) {
  const res = await githubRequest('POST', `/repos/${OWNER}/${REPO}/pulls`, { title, body, head: branch, base });
  if (res.status !== 201) throw new Error(`Failed to create PR: ${JSON.stringify(res.body)}`);
  console.log(`[HITL] PR created: ${res.body.html_url}`);
  return res.body;
}

async function getPRStatus(prNumber) {
  const res = await githubRequest('GET', `/repos/${OWNER}/${REPO}/pulls/${prNumber}`);
  if (res.status !== 200) throw new Error(`Failed to get PR ${prNumber}`);
  return {
    number: res.body.number,
    state: res.body.state,
    merged: res.body.merged,
    mergeable: res.body.mergeable,
    url: res.body.html_url,
    reviews: res.body.requested_reviewers,
  };
}

async function getPRReviews(prNumber) {
  const res = await githubRequest('GET', `/repos/${OWNER}/${REPO}/pulls/${prNumber}/reviews`);
  if (res.status !== 200) throw new Error(`Failed to get reviews for PR ${prNumber}`);
  return res.body;
}

async function addPRComment(prNumber, comment) {
  const res = await githubRequest('POST', `/repos/${OWNER}/${REPO}/issues/${prNumber}/comments`, { body: comment });
  if (res.status !== 201) throw new Error(`Failed to add comment to PR ${prNumber}`);
  return res.body;
}

async function waitForPRApproval(prNumber, pollIntervalMs = 15000, timeoutMs = 3600000) {
  if (process.env.HITL_AUTO_APPROVE === 'true') {
    console.log(`[HITL] AUTO_APPROVE enabled — skipping PR #${prNumber} review gate.`);
    return { decision: 'approved', prNumber };
  }

  console.log(`[HITL] Waiting for PR #${prNumber} approval...`);
  console.log(`[HITL] Type "approve" or "reject [feedback]" here, OR approve on GitHub — whichever comes first.`);

  const readline = require('readline');
  let stdinDecision = null;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  rl.on('line', (line) => {
    const trimmed = line.trim().toLowerCase();
    if (trimmed === 'approve' || trimmed === 'approved') {
      stdinDecision = { decision: 'approved', prNumber };
    } else if (trimmed.startsWith('reject') || trimmed.startsWith('changes')) {
      const feedback = line.replace(/^(reject|changes[_\s]?requested):?\s*/i, '').trim();
      stdinDecision = { decision: 'changes_requested', feedback, prNumber };
    }
  });

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (stdinDecision) { rl.close(); return stdinDecision; }

    try {
      const reviews = await getPRReviews(prNumber);
      const latestByUser = {};
      for (const review of reviews) latestByUser[review.user.login] = review.state;
      const states = Object.values(latestByUser);

      if (states.some(s => s === 'CHANGES_REQUESTED')) {
        rl.close();
        const feedback = reviews.filter(r => r.state === 'CHANGES_REQUESTED').map(r => r.body).join('\n');
        console.warn(`[HITL] PR #${prNumber} — changes requested.`);
        return { decision: 'changes_requested', feedback, prNumber };
      }
      if (states.some(s => s === 'APPROVED')) {
        rl.close();
        console.log(`[HITL] PR #${prNumber} approved (GitHub).`);
        return { decision: 'approved', prNumber };
      }
    } catch { /* network hiccup — keep polling */ }

    await new Promise(r => setTimeout(r, pollIntervalMs));
  }

  rl.close();
  return { decision: 'timeout', prNumber };
}

async function waitForStdinApproval(phaseName, summary = '') {
  if (process.env.HITL_AUTO_APPROVE === 'true') {
    console.log(`[HITL:${phaseName}] AUTO_APPROVE enabled — skipping interactive gate.`);
    return { decision: 'approved' };
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`[HITL:${phaseName}] Phase complete — review the output above.`);
  if (summary) console.log(`[HITL:${phaseName}] Output summary:\n${summary}`);
  console.log(`[HITL:${phaseName}] Type "approve" to proceed, or "reject <feedback>" to re-run with changes.`);
  console.log('─'.repeat(60));

  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

  return new Promise((resolve) => {
    rl.on('line', (line) => {
      const trimmed = line.trim().toLowerCase();
      if (trimmed === 'approve' || trimmed === 'approved') {
        rl.close();
        console.log(`[HITL:${phaseName}] Approved — proceeding to next phase.`);
        resolve({ decision: 'approved' });
      } else if (trimmed.startsWith('reject') || trimmed.startsWith('changes')) {
        const feedback = line.replace(/^(reject|changes[_\s]?requested):?\s*/i, '').trim();
        rl.close();
        console.log(`[HITL:${phaseName}] Changes requested — re-running phase with feedback.`);
        resolve({ decision: 'changes_requested', feedback });
      } else {
        console.log(`[HITL:${phaseName}] Unrecognised input. Type "approve" or "reject <feedback>".`);
      }
    });
  });
}

module.exports = { createPR, getPRStatus, getPRReviews, addPRComment, waitForPRApproval, waitForStdinApproval };
