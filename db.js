const Database = require('better-sqlite3');
const path = require('path');

// SQLite file lives next to the server. On free-tier hosts without a
// persistent disk, this resets on redeploy — fine for a demo/prototype,
// but worth knowing before you rely on it for real client data.
const db = new Database(path.join(__dirname, 'data.sqlite'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name   TEXT NOT NULL,
    email          TEXT NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    role           TEXT NOT NULL DEFAULT 'client',
    assessment_completed INTEGER NOT NULL DEFAULT 0,
    assessment_data TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS assessment_requests (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    email        TEXT NOT NULL,
    company_name TEXT,
    message      TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    sender     TEXT NOT NULL CHECK (sender IN ('client','admin')),
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Lightweight migration for DBs created before role/assessment_data existed
// (SQLite has no "ADD COLUMN IF NOT EXISTS", so check first).
const userColumns = db.prepare(`PRAGMA table_info(users)`).all().map(c => c.name);
if (!userColumns.includes('role')) {
  db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'client'`);
}
if (!userColumns.includes('assessment_data')) {
  db.exec(`ALTER TABLE users ADD COLUMN assessment_data TEXT`);
}
if (!userColumns.includes('report_filename')) {
  db.exec(`ALTER TABLE users ADD COLUMN report_filename TEXT`);
}
if (!userColumns.includes('assessment_completed_at')) {
  db.exec(`ALTER TABLE users ADD COLUMN assessment_completed_at TEXT`);
}
if (!userColumns.includes('contact_name')) {
  db.exec(`ALTER TABLE users ADD COLUMN contact_name TEXT`);
}
if (!userColumns.includes('certificate_id')) {
  db.exec(`ALTER TABLE users ADD COLUMN certificate_id TEXT`);
}

module.exports = db;
