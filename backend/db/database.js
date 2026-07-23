const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'tickets.sqlite');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const db = new DatabaseSync(DB_PATH);

// Track applied migrations
db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at TEXT DEFAULT (datetime('now'))
)`);

const migrationFiles = fs.readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort();

for (const file of migrationFiles) {
  const already = db.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(file);
  if (!already) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    try {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(file);
      console.log(`[db] Applied migration: ${file}`);
    } catch (err) {
      console.error(`[db] Migration failed (${file}):`, err.message);
      throw err;
    }
  }
}

module.exports = db;
