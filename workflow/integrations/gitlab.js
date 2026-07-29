require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const https = require('https');

const GITLAB_BASE = (process.env.GITLAB_BASE_URL || 'https://gitlab.com').replace(/\/$/, '');
const PAT         = process.env.GITLAB_PAT;
const PROJECT_ID  = process.env.GITLAB_PROJECT_ID;

if (!PAT)        console.warn('[gitlab] GITLAB_PAT not set — GitLab API calls will fail');
if (!PROJECT_ID) console.warn('[gitlab] GITLAB_PROJECT_ID not set — GitLab API calls will fail');

// ── HTTP helper ────────────────────────────────────────────────────────────────
function gitlabRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url     = new URL(`${GITLAB_BASE}/api/v4${path}`);
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'PRIVATE-TOKEN': PAT,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
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
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Wiki helpers ───────────────────────────────────────────────────────────────

/**
 * Create a new wiki page.
 * Returns { url, slug } on success, throws on failure.
 */
async function createWikiPage(title, content) {
  const encodedId = encodeURIComponent(PROJECT_ID);
  const res = await gitlabRequest('POST', `/projects/${encodedId}/wikis`, { title, content, format: 'markdown' });

  if (res.status === 201) {
    const slug = res.body.slug;
    const url  = `${GITLAB_BASE}/${process.env.GITLAB_NAMESPACE || PROJECT_ID}/-/wikis/${slug}`;
    console.log(`[gitlab] Wiki page created: ${url}`);
    return { url, slug, title: res.body.title };
  }

  // 409 Conflict — page already exists, fall through to update
  if (res.status === 409) {
    console.warn(`[gitlab] Wiki page "${title}" already exists — updating instead.`);
    const slug = title.replace(/\s+/g, '-').toLowerCase();
    return updateWikiPage(slug, title, content);
  }

  throw new Error(`GitLab createWikiPage failed (${res.status}): ${JSON.stringify(res.body)}`);
}

/**
 * Update an existing wiki page by slug.
 * Returns { url, slug } on success, throws on failure.
 */
async function updateWikiPage(slug, title, content) {
  const encodedId   = encodeURIComponent(PROJECT_ID);
  const encodedSlug = encodeURIComponent(slug);
  const res = await gitlabRequest('PUT', `/projects/${encodedId}/wikis/${encodedSlug}`, { title, content, format: 'markdown' });

  if (res.status === 200) {
    const url = `${GITLAB_BASE}/${process.env.GITLAB_NAMESPACE || PROJECT_ID}/-/wikis/${res.body.slug}`;
    console.log(`[gitlab] Wiki page updated: ${url}`);
    return { url, slug: res.body.slug, title: res.body.title };
  }

  throw new Error(`GitLab updateWikiPage failed (${res.status}): ${JSON.stringify(res.body)}`);
}

/**
 * Publish or overwrite a wiki page (create-or-update).
 * Use this from phase runners — handles both first run and HITL retries.
 */
async function publishWikiPage(title, content) {
  try {
    return await createWikiPage(title, content);
  } catch (err) {
    if (err.message.includes('already exists')) {
      const slug = title.replace(/\s+/g, '-').toLowerCase();
      return updateWikiPage(slug, title, content);
    }
    throw err;
  }
}

// ── Milestone helpers ──────────────────────────────────────────────────────────

/**
 * Create a GitLab milestone for a sprint.
 * Returns { id, iid, title, url } on success, throws on failure.
 */
async function createMilestone(title, description = '') {
  const encodedId = encodeURIComponent(PROJECT_ID);
  const res = await gitlabRequest('POST', `/projects/${encodedId}/milestones`, { title, description });

  if (res.status === 201) {
    const url = `${GITLAB_BASE}/${process.env.GITLAB_NAMESPACE || PROJECT_ID}/-/milestones/${res.body.iid}`;
    console.log(`[gitlab] Milestone created: "${res.body.title}" (id=${res.body.id})`);
    return { id: res.body.id, iid: res.body.iid, title: res.body.title, url };
  }

  throw new Error(`GitLab createMilestone failed (${res.status}): ${JSON.stringify(res.body)}`);
}

// ── Issue helpers ──────────────────────────────────────────────────────────────

/**
 * Create a GitLab issue linked to a milestone.
 * Returns { id, iid, title, url } on success, throws on failure.
 */
async function createIssue(title, description, milestoneId = null, labels = []) {
  const encodedId = encodeURIComponent(PROJECT_ID);
  const body = { title, description };
  if (milestoneId !== null) body.milestone_id = milestoneId;
  if (labels.length > 0) body.labels = labels.join(',');

  const res = await gitlabRequest('POST', `/projects/${encodedId}/issues`, body);

  if (res.status === 201) {
    console.log(`[gitlab] Issue created: "${res.body.title}" (#${res.body.iid})`);
    return { id: res.body.id, iid: res.body.iid, title: res.body.title, url: res.body.web_url };
  }

  throw new Error(`GitLab createIssue failed (${res.status}): ${JSON.stringify(res.body)}`);
}

// ── Repository helpers ─────────────────────────────────────────────────────────

/**
 * Create a branch off a ref (default branch if not specified).
 * Returns { name } on success, throws on failure.
 * If the branch already exists (400), logs a warning and resolves with the existing name.
 */
async function createBranch(branchName, ref) {
  const base      = ref || process.env.GITLAB_DEFAULT_BRANCH || 'main';
  const encodedId = encodeURIComponent(PROJECT_ID);
  const res       = await gitlabRequest('POST', `/projects/${encodedId}/repository/branches`, {
    branch: branchName,
    ref: base,
  });

  if (res.status === 201) {
    console.log(`[gitlab] Branch created: ${branchName} (from ${base})`);
    return { name: res.body.name };
  }

  // 400 — branch already exists; reuse it
  if (res.status === 400) {
    console.warn(`[gitlab] Branch "${branchName}" already exists — reusing.`);
    return { name: branchName };
  }

  throw new Error(`GitLab createBranch failed (${res.status}): ${JSON.stringify(res.body)}`);
}

/**
 * Create or update a file on a branch.
 * Returns { filePath, branch } on success, throws on failure.
 */
async function commitFile(branch, filePath, content, commitMessage) {
  const encodedId   = encodeURIComponent(PROJECT_ID);
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('%2F');
  const body        = { branch, content, commit_message: commitMessage, encoding: 'text' };

  let res = await gitlabRequest('POST', `/projects/${encodedId}/repository/files/${encodedPath}`, body);

  // 400 means the file already exists on this branch — update instead
  if (res.status === 400) {
    res = await gitlabRequest('PUT', `/projects/${encodedId}/repository/files/${encodedPath}`, body);
  }

  if (res.status === 201 || res.status === 200) {
    console.log(`[gitlab] File committed: ${filePath} → branch "${branch}"`);
    return { filePath, branch };
  }

  throw new Error(`GitLab commitFile failed (${res.status}): ${JSON.stringify(res.body)}`);
}

/**
 * Open a Merge Request.
 * Returns { id, iid, title, url } on success, throws on failure.
 */
async function createMergeRequest(sourceBranch, targetBranch, title, description, milestoneId = null) {
  const encodedId = encodeURIComponent(PROJECT_ID);
  const body = {
    source_branch: sourceBranch,
    target_branch: targetBranch,
    title,
    description,
    remove_source_branch: false,
  };
  if (milestoneId !== null) body.milestone_id = milestoneId;

  const res = await gitlabRequest('POST', `/projects/${encodedId}/merge_requests`, body);

  if (res.status === 201) {
    console.log(`[gitlab] MR created: "${res.body.title}" (!${res.body.iid}) → ${res.body.web_url}`);
    return { id: res.body.id, iid: res.body.iid, title: res.body.title, url: res.body.web_url };
  }

  throw new Error(`GitLab createMergeRequest failed (${res.status}): ${JSON.stringify(res.body)}`);
}

module.exports = {
  gitlabRequest,
  createWikiPage, updateWikiPage, publishWikiPage,
  createMilestone, createIssue,
  createBranch, commitFile, createMergeRequest,
};
