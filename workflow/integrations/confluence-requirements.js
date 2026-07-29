require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const CONF_BASE  = (process.env.CONFLUENCE_BASE_URL || '').replace(/\/$/, '');
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_TOKEN = process.env.JIRA_API_TOKEN;

const ENHANCEMENT_FILE = path.join(__dirname, '../../requirements/Enhancement.txt');

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractPageIdFromUrl(url) {
  const m = url.match(/\/pages\/(\d+)/);
  if (!m) throw new Error(`Cannot extract page ID from Confluence URL: ${url}`);
  return m[1];
}

function stripHtml(storageHtml) {
  return storageHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<ac:plain-text-body>[\s\S]*?<\/ac:plain-text-body>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchPageContent(pageId) {
  return new Promise((resolve, reject) => {
    const auth    = Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString('base64');
    const urlPath = `/rest/api/content/${pageId}?expand=body.storage`;
    const url     = new URL(CONF_BASE + urlPath);

    const req = https.request({
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method:   'GET',
      headers: {
        Authorization:  `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept:         'application/json',
      },
    }, (res) => {
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

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Reads the Confluence requirements page URL from Enhancement.txt,
 * fetches the page content via the Confluence REST API, and returns
 * the body as plain text ready for EPIC/STORY/TASK parsing.
 *
 * Enhancement.txt format (first URL found on any line is used):
 *   Confluence requirement enhancement link: https://<site>/wiki/spaces/.../pages/<pageId>/...
 */
async function getRequirementsText() {
  if (!fs.existsSync(ENHANCEMENT_FILE)) {
    throw new Error(`Enhancement.txt not found: ${ENHANCEMENT_FILE}`);
  }

  const enhancementTxt = fs.readFileSync(ENHANCEMENT_FILE, 'utf8').trim();
  const urlMatch = enhancementTxt.match(/https?:\/\/[^\s]+/);
  if (!urlMatch) throw new Error('No Confluence URL found in requirements/Enhancement.txt');

  const confluenceUrl = urlMatch[0];
  const pageId        = extractPageIdFromUrl(confluenceUrl);

  console.log(`[confluence-requirements] Fetching requirements from Confluence page ${pageId}`);
  console.log(`[confluence-requirements] Source: ${confluenceUrl}`);

  const res = await fetchPageContent(pageId);
  if (res.status !== 200) {
    throw new Error(`Confluence API returned ${res.status}: ${JSON.stringify(res.body)}`);
  }

  const storageHtml = res.body?.body?.storage?.value || '';
  if (!storageHtml) {
    throw new Error(`Confluence page ${pageId} has no body content`);
  }

  const pageTitle = res.body.title || pageId;
  console.log(`[confluence-requirements] Page: "${pageTitle}" (${storageHtml.length} chars of storage content)`);

  return stripHtml(storageHtml);
}

module.exports = { getRequirementsText };
