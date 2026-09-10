require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const https = require('https');
const fs = require('fs');
const path = require('path');

// Base Confluence URL (no trailing slash)
const CONF_BASE = (process.env.CONFLUENCE_BASE_URL || '').replace(/\/$/, '');
// Credentials for Confluence API
const CONFLUENCE_EMAIL = process.env.CONFLUENCE_EMAIL || process.env.JIRA_EMAIL;
const CONFLUENCE_API_TOKEN = process.env.CONFLUENCE_API_TOKEN || process.env.ATLASSIAN_API_TOKEN;

// File containing the Confluence page URL
const ENHANCEMENT_FILE = path.join(__dirname, '../../requirements/Enhancement.txt');

// Extract numeric page ID from a Confluence URL
function extractPageIdFromUrl(url) {
  const match = url.match(/\/pages\/(\d+)/);
  if (!match) throw new Error(`Cannot extract page ID from URL: ${url}`);
  return match[1];
}

// Strip Confluence storage-format HTML down to plain text
function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>>?/gi, '\n')
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
    .replace(/\n{2,}/g, '\n\n')
    .trim();
}

// Fetch Confluence page storage HTML via REST API
async function fetchPageStorage(pageId) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${CONFLUENCE_EMAIL}:${CONFLUENCE_API_TOKEN}`).toString('base64');
    const apiPath = `/wiki/rest/api/content/${pageId}?expand=body.storage`;
    const url = new URL(CONF_BASE + apiPath);

    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'GET',
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json'
        }
      },
      res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`Confluence API returned status ${res.statusCode}`));
          }
          let parsed;
          try { parsed = JSON.parse(data); } catch (e) { return reject(new Error(`Invalid JSON from Confluence: ${e.message}`)); }
          const storage = parsed.body?.storage?.value;
          if (typeof storage !== 'string') {
            return reject(new Error(`No storage.value field in response for page ${pageId}`));
          }
          resolve(storage);
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// Public API: read file, fetch page, return plain-text
async function getRequirementsText() {
  if (!fs.existsSync(ENHANCEMENT_FILE)) {
    throw new Error(`Enhancement.txt not found at ${ENHANCEMENT_FILE}`);
  }
  const fileContent = fs.readFileSync(ENHANCEMENT_FILE, 'utf8');
  const urlRegex = /https?:\/\/\S+/g;
  const urls = process.env.CONFLUENCE_PAGE_URL ? [process.env.CONFLUENCE_PAGE_URL] : fileContent.match(urlRegex) || [];
  if (!urls.length) {
    throw new Error('No Confluence URL found in Enhancement.txt or via CONFLUENCE_PAGE_URL');
  }
  const confluenceUrl = urls[0];
  const pageId = extractPageIdFromUrl(confluenceUrl);
  console.log(`[confluence-requirements] Fetching requirements from Confluence page ${pageId}`);

  const storageHtml = await fetchPageStorage(pageId);
  return stripHtml(storageHtml);
}

module.exports = { getRequirementsText };