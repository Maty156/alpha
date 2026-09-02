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
    assessment_completed INTEGER NOT NULL DEFAULT 0,
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
`);

module.exports = db;
