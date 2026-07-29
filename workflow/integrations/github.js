require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const https = require('https');

const OWNER = process.env.GITHUB_OWNER;
const REPO  = process.env.GITHUB_REPO;
const PAT   = process.env.GITHUB_PAT;

function githubRequest(method, apiPath, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: apiPath,
      method,
      headers: {
        'Authorization': `Bearer ${PAT}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'CSTS-Orchestrator',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
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
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * Commit (create or update) a file in the GitHub repository.
 * Handles the SHA lookup required for updates automatically.
 *
 * @param {string} branch      - Target branch (e.g. 'feature/ai-enhancements-...' or 'main')
 * @param {string} filePath    - Repo-relative path (e.g. 'README.md')
 * @param {string} content     - UTF-8 file content
 * @param {string} message     - Commit message
 * @returns {object}           - GitHub API response body
 */
async function commitFile(branch, filePath, content, message) {
  const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
  const apiPath = `/repos/${OWNER}/${REPO}/contents/${encodedPath}`;

  // Fetch existing file SHA so we can update rather than create
  let sha;
  const getRes = await githubRequest('GET', `${apiPath}?ref=${encodeURIComponent(branch)}`);
  if (getRes.status === 200) sha = getRes.body.sha;

  const payload = {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch,
    ...(sha ? { sha } : {}),
  };

  const res = await githubRequest('PUT', apiPath, payload);
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`GitHub commitFile failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

/**
 * Get the URL of a file on a specific branch.
 */
function fileUrl(branch, filePath) {
  return `https://github.com/${OWNER}/${REPO}/blob/${encodeURIComponent(branch)}/${filePath}`;
}

module.exports = { commitFile, fileUrl };
