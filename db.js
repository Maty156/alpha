const { createClient } = require('@libsql/client');
const path = require('path');

// Local dev / no Turso configured yet: uses a plain SQLite file next to the
// server, identical behavior to before.
// Production on Vercel (or any serverless host): set TURSO_DATABASE_URL and
// TURSO_AUTH_TOKEN — same client, same code, now backed by a real network
// database instead of a local file that Vercel would wipe every request.
const client = createClient(
  process.env.TURSO_DATABASE_URL
    ? { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }
    : { url: `file:${path.join(__dirname, 'data.sqlite')}` }
);

// Thin wrapper so route code can keep the familiar
// `await db.prepare(sql).get(...)` / `.all(...)` / `.run(...)` shape instead
// of rewriting every call site to the raw libSQL execute() API.
function prepare(sql) {
  return {
    async get(...args) {
      const result = await client.execute({ sql, args });
      return result.rows[0];
    },
    async all(...args) {
      const result = await client.execute({ sql, args });
      return result.rows;
    },
    async run(...args) {
      const result = await client.execute({ sql, args });
      return {
        lastInsertRowid: Number(result.lastInsertRowid),
        changes: result.rowsAffected,
      };
    },
  };
}

let initPromise = null;

async function init() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await client.executeMultiple(`
      CREATE TABLE IF NOT EXISTS users (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        company_name   TEXT NOT NULL,
        email          TEXT NOT NULL UNIQUE,
        password_hash  TEXT NOT NULL,
        role           TEXT NOT NULL DEFAULT 'client',
        assessment_completed INTEGER NOT NULL DEFAULT 0,
        assessment_data TEXT,
        report_filename TEXT,
        report_data BLOB,
        assessment_completed_at TEXT,
        contact_name TEXT,
        certificate_id TEXT,
        created_at     TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS assessment_requests (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT NOT NULL,
        email           TEXT NOT NULL,
        company_name    TEXT,
        message         TEXT,
        assessment_type TEXT,
        preferred_date  TEXT,
        status          TEXT NOT NULL DEFAULT 'Pending',
        created_at      TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS messages (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL REFERENCES users(id),
        sender     TEXT NOT NULL CHECK (sender IN ('client','admin')),
        body       TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER REFERENCES users(id),
        actor_label TEXT,
        action     TEXT NOT NULL,
        resource   TEXT,
        metadata   TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS security_events (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        source       TEXT NOT NULL CHECK (source IN ('collector','simulator')),
        event_id     TEXT NOT NULL,
        raw_data     TEXT NOT NULL,
        received_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id                     INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id               INTEGER REFERENCES security_events(id),
        rule_key               TEXT NOT NULL,
        title                  TEXT NOT NULL,
        severity               TEXT NOT NULL,
        mitre_technique        TEXT,
        description            TEXT,
        status                 TEXT NOT NULL DEFAULT 'New',
        investigation_notes    TEXT,
        promoted_finding_client_id INTEGER REFERENCES users(id),
        created_at             TEXT NOT NULL DEFAULT (datetime('now')),
        resolved_at            TEXT
      );
    `);

    // Migration path for DBs created before some of these columns existed
    // (both a fresh local file and a fresh Turso DB already have them from
    // the CREATE TABLE above, so this only matters for older data.sqlite
    // files carried over from earlier in the project).
    const tableInfo = await client.execute(`PRAGMA table_info(users)`);
    const existing = tableInfo.rows.map(c => c.name);
    const maybeAdd = async (col, def) => {
      if (!existing.includes(col)) {
        await client.execute(`ALTER TABLE users ADD COLUMN ${col} ${def}`);
      }
    };
    await maybeAdd('role', `TEXT NOT NULL DEFAULT 'client'`);
    await maybeAdd('assessment_data', 'TEXT');
    await maybeAdd('report_filename', 'TEXT');
    await maybeAdd('report_data', 'BLOB');
    await maybeAdd('assessment_completed_at', 'TEXT');
    await maybeAdd('contact_name', 'TEXT');
    await maybeAdd('certificate_id', 'TEXT');

    // Same safety net for assessment_requests — older deployments may have
    // the table without these newer columns.
    const reqTableInfo = await client.execute(`PRAGMA table_info(assessment_requests)`);
    const reqExisting = reqTableInfo.rows.map(c => c.name);
    const maybeAddReq = async (col, def) => {
      if (!reqExisting.includes(col)) {
        await client.execute(`ALTER TABLE assessment_requests ADD COLUMN ${col} ${def}`);
      }
    };
    await maybeAddReq('assessment_type', 'TEXT');
    await maybeAddReq('preferred_date', 'TEXT');
    await maybeAddReq('status', `TEXT NOT NULL DEFAULT 'Pending'`);
  })();

  return initPromise;
}

module.exports = { prepare, init, client };
