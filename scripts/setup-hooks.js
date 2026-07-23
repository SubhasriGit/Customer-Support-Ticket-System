const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src  = path.join(root, '.github', 'hooks', 'pre-commit');
const dest = path.join(root, '.git', 'hooks', 'pre-commit');

if (!fs.existsSync(path.join(root, '.git'))) {
  console.error('ERROR: .git directory not found. Run "git init" first.');
  process.exit(1);
}

fs.mkdirSync(path.join(root, '.git', 'hooks'), { recursive: true });
fs.copyFileSync(src, dest);

// Set executable bit on non-Windows
if (process.platform !== 'win32') {
  fs.chmodSync(dest, '755');
}

console.log('Git pre-commit hook installed successfully.');
console.log('Hook will block any commit containing hardcoded secrets.');
