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
  console.log(`[HITL] Waiting for PR #${prNumber} approval... (polling every ${pollIntervalMs / 1000}s)`);
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const reviews = await getPRReviews(prNumber);
    const latestByUser = {};

    for (const review of reviews) {
      latestByUser[review.user.login] = review.state;
    }

    const states = Object.values(latestByUser);
    const approved = states.some(s => s === 'APPROVED');
    const changesRequested = states.some(s => s === 'CHANGES_REQUESTED');

    if (changesRequested) {
      const feedback = reviews.filter(r => r.state === 'CHANGES_REQUESTED').map(r => r.body).join('\n');
      console.warn(`[HITL] PR #${prNumber} — changes requested.`);
      return { decision: 'changes_requested', feedback, prNumber };
    }

    if (approved) {
      console.log(`[HITL] PR #${prNumber} approved.`);
      return { decision: 'approved', prNumber };
    }

    await new Promise(r => setTimeout(r, pollIntervalMs));
  }

  return { decision: 'timeout', prNumber };
}

module.exports = { createPR, getPRStatus, getPRReviews, addPRComment, waitForPRApproval };
