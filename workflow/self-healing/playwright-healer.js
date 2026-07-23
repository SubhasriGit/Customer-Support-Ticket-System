const fs = require('fs');
const path = require('path');

/**
 * Self-healing Playwright selector module.
 *
 * When a test fails because an element path changed, this module:
 * 1. Receives the broken selector and current page HTML snapshot
 * 2. Uses heuristics + AI (via MCP) to find the new matching element
 * 3. Updates the test file with the healed selector
 * 4. Returns the new selector so the test runner can retry
 */

const HEALING_STRATEGIES = [
  { name: 'data-testid',   fn: (snapshot, hint) => findByTestId(snapshot, hint) },
  { name: 'aria-label',    fn: (snapshot, hint) => findByAriaLabel(snapshot, hint) },
  { name: 'text-content',  fn: (snapshot, hint) => findByText(snapshot, hint) },
  { name: 'role',          fn: (snapshot, hint) => findByRole(snapshot, hint) },
];

function findByTestId(snapshot, hint) {
  const matches = [...snapshot.matchAll(/data-testid="([^"]+)"/g)].map(m => m[1]);
  return matches.find(id => id.toLowerCase().includes(hint.toLowerCase()))
    ? `[data-testid="${matches.find(id => id.toLowerCase().includes(hint.toLowerCase()))}"]`
    : null;
}

function findByAriaLabel(snapshot, hint) {
  const matches = [...snapshot.matchAll(/aria-label="([^"]+)"/g)].map(m => m[1]);
  const found = matches.find(label => label.toLowerCase().includes(hint.toLowerCase()));
  return found ? `[aria-label="${found}"]` : null;
}

function findByText(snapshot, hint) {
  const matches = [...snapshot.matchAll(/>([^<]{2,60})</g)].map(m => m[1].trim()).filter(Boolean);
  const found = matches.find(t => t.toLowerCase().includes(hint.toLowerCase()));
  return found ? `text=${found}` : null;
}

function findByRole(snapshot, hint) {
  const roleMap = { button: 'button', input: 'textbox', select: 'combobox', a: 'link' };
  for (const [tag, role] of Object.entries(roleMap)) {
    if (hint.toLowerCase().includes(tag) || hint.toLowerCase().includes(role)) {
      return `role=${role}`;
    }
  }
  return null;
}

async function healSelector(brokenSelector, pageSnapshot, hint = '') {
  const searchHint = hint || brokenSelector.replace(/[\[\]#.>:]/g, ' ').trim();

  for (const strategy of HEALING_STRATEGIES) {
    const healed = strategy.fn(pageSnapshot, searchHint);
    if (healed && healed !== brokenSelector) {
      console.log(`[self-heal] "${brokenSelector}" → "${healed}" (via ${strategy.name})`);
      return { healed: true, original: brokenSelector, replacement: healed, strategy: strategy.name };
    }
  }

  console.warn(`[self-heal] Could not heal selector: "${brokenSelector}". Manual intervention required.`);
  return { healed: false, original: brokenSelector, replacement: null, strategy: null };
}

function applyHealedSelector(testFilePath, original, replacement) {
  if (!fs.existsSync(testFilePath)) {
    throw new Error(`Test file not found: ${testFilePath}`);
  }

  const content = fs.readFileSync(testFilePath, 'utf8');
  const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const updated = content.replace(new RegExp(escaped, 'g'), replacement);

  if (content === updated) {
    console.warn(`[self-heal] Selector "${original}" not found in ${testFilePath}`);
    return false;
  }

  fs.writeFileSync(testFilePath, updated, 'utf8');
  console.log(`[self-heal] Updated ${path.basename(testFilePath)}: "${original}" → "${replacement}"`);
  return true;
}

function logHealingAction(entry) {
  const logPath = path.join(__dirname, '../../tests/healing-log.json');
  let log = [];
  if (fs.existsSync(logPath)) {
    try { log = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch { log = []; }
  }
  log.push({ ...entry, timestamp: new Date().toISOString() });
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf8');
}

module.exports = { healSelector, applyHealedSelector, logHealingAction };
