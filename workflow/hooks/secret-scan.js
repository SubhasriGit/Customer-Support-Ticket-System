const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');

// ── Directories and files to skip entirely ─────────────────────────────────────
const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.git', 'frontend/node_modules',
  'backend/node_modules', 'coverage', '.nyc_output',
]);
const SKIP_FILES = new Set(['.env', '.env.example', 'package-lock.json']);
const SCAN_EXTS  = new Set(['.js', '.ts', '.jsx', '.tsx', '.json', '.yaml', '.yml', '.env']);

// ── Patterns that signal a real hardcoded secret ───────────────────────────────
// Each entry: { name, regex, description }
// regex must be applied per line; capture group 1 = the offending value
const SECRET_PATTERNS = [
  // Known token prefixes (always real when found in source code)
  { name: 'GitHub PAT',           regex: /(?<!\bprocess\.env\b[^'"]*)(ghp_[A-Za-z0-9]{20,})/g,                     description: 'GitHub Personal Access Token (ghp_...)' },
  { name: 'GitHub Fine-grained',  regex: /(?<!\bprocess\.env\b[^'"]*)(github_pat_[A-Za-z0-9_]{20,})/g,             description: 'GitHub Fine-grained PAT (github_pat_...)' },
  { name: 'Anthropic API Key',    regex: /(?<!\bprocess\.env\b[^'"]*)(sk-ant-[A-Za-z0-9\-_]{20,})/g,               description: 'Anthropic API key (sk-ant-...)' },
  { name: 'OpenAI API Key',       regex: /(?<!\bprocess\.env\b[^'"]*)(sk-[A-Za-z0-9]{20,})/g,                      description: 'OpenAI API key (sk-...)' },
  { name: 'Atlassian Token',      regex: /(?<!\bprocess\.env\b[^'"]*)(ATATT[A-Za-z0-9+\/=\-_]{20,})/g,             description: 'Atlassian API token (ATATT...)' },
  { name: 'Render API Key',       regex: /(?<!\bprocess\.env\b[^'"]*)(rnd_[A-Za-z0-9]{20,})/g,                     description: 'Render.com API key (rnd_...)' },
  { name: 'AWS Access Key',       regex: /(?<!\bprocess\.env\b[^'"]*)(AKIA[0-9A-Z]{16})/g,                         description: 'AWS Access Key ID (AKIA...)' },
  { name: 'AWS Secret Key',       regex: /(?<!\bprocess\.env\b[^'"]*)(["'][A-Za-z0-9\/+]{40}["'])/g,               description: 'Possible AWS secret key (40-char base64)' },
  { name: 'Bearer Token',         regex: /Authorization\s*[:=]\s*['"`]Bearer\s+(?!process\.env)([A-Za-z0-9\-._~+\/]{20,})/gi, description: 'Hardcoded Bearer token' },

  // Generic password/secret assignments  (value is not a placeholder or env-var reference)
  { name: 'Hardcoded password',   regex: /(?:password|passwd|pwd)\s*[:=]\s*['"`]([^'"`\$]{6,})['"`]/gi,             description: 'Hardcoded password literal' },
  { name: 'Hardcoded secret',     regex: /(?:secret|secret_key|secretkey)\s*[:=]\s*['"`]([^'"`\$]{8,})['"`]/gi,     description: 'Hardcoded secret literal' },
  { name: 'Hardcoded API key',    regex: /(?:api_key|apikey|api_token|access_token)\s*[:=]\s*['"`]([^'"`\$]{10,})['"`]/gi, description: 'Hardcoded API key/token literal' },
];

// ── Values that are definitely safe to ignore ──────────────────────────────────
const SAFE_PATTERNS = [
  /your_[a-z_]+_here/i,       // .env.example placeholders
  /xxxx/i,                    // masked values
  /placeholder/i,
  /changeme/i,
  /example/i,
  /test_?secret/i,            // test fixtures
  /dummy/i,
  /fake/i,
  /sample/i,
  /\$\{/,                     // template literal with variable
  /process\.env\./,           // env var reference
  /sk-ant-api03-REPLACE/i,    // docs example
];

function isSafeLine(line) {
  return SAFE_PATTERNS.some(p => p.test(line));
}

function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('#') || t.startsWith('<!--');
}

// ── Walk directory tree, yield files to scan ──────────────────────────────────
function* walkFiles(dir, relBase = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !SKIP_DIRS.has(relPath)) {
        yield* walkFiles(path.join(dir, entry.name), relPath);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!SKIP_FILES.has(entry.name) && SCAN_EXTS.has(ext)) {
        yield { absPath: path.join(dir, entry.name), relPath };
      }
    }
  }
}

// ── Main scan function ─────────────────────────────────────────────────────────
function secretScan() {
  const findings = [];

  for (const { absPath, relPath } of walkFiles(ROOT)) {
    let content;
    try { content = fs.readFileSync(absPath, 'utf8'); } catch { continue; }

    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (isCommentLine(line) || isSafeLine(line)) return;

      for (const pattern of SECRET_PATTERNS) {
        const rx = new RegExp(pattern.regex.source, pattern.regex.flags);
        let m;
        while ((m = rx.exec(line)) !== null) {
          const value = m[1] || m[0];
          // Double-check the matched value itself isn't a safe placeholder
          if (SAFE_PATTERNS.some(p => p.test(value))) continue;
          findings.push({
            file:        relPath,
            line:        idx + 1,
            col:         m.index + 1,
            rule:        pattern.name,
            description: pattern.description,
            snippet:     line.trim().slice(0, 120),
          });
        }
      }
    });
  }

  return findings;
}

// ── Hook entry point ───────────────────────────────────────────────────────────
function runSecretScan() {
  console.log('[secret-scan] Scanning source files for hardcoded secrets...');
  const findings = secretScan();

  if (findings.length === 0) {
    console.log('[secret-scan] ✅ No hardcoded secrets detected.');
    return { passed: true, findings: [] };
  }

  console.error(`\n[secret-scan] ❌ ${findings.length} potential secret(s) found in source code:\n`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}:${f.col}  [${f.rule}]`);
    console.error(`    ${f.description}`);
    console.error(`    → ${f.snippet}\n`);
  }
  console.error('[secret-scan] Move all secrets to .env and reference them via process.env.*');
  console.error('[secret-scan] Ensure .env is listed in .gitignore and never committed.\n');

  return { passed: false, findings };
}

module.exports = { runSecretScan, secretScan };

// Standalone: node workflow/hooks/secret-scan.js
if (require.main === module) {
  const result = runSecretScan();
  process.exit(result.passed ? 0 : 1);
}
