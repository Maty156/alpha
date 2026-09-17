const db = require('../db');

/**
 * Records a security-relevant action. Never pass passwords, tokens, or
 * other secrets in `metadata` — this table is designed to be safely
 * readable by an admin without exposing sensitive data.
 *
 * @param {object} opts
 * @param {number|null} opts.userId - the acting user's id, or null for anonymous/system actions
 * @param {string} opts.actorLabel - human-readable label, e.g. "client:jane@corp.com" or "admin:matyas"
 * @param {string} opts.action - short machine-readable action name, e.g. "login", "assessment.completed"
 * @param {string} [opts.resource] - what the action targeted, e.g. "user:14" or "assessment_request:3"
 * @param {object} [opts.metadata] - small plain-object of extra context (no secrets)
 */
async function logAction({ userId = null, actorLabel, action, resource = null, metadata = null }) {
  try {
    await db
      .prepare('INSERT INTO audit_logs (user_id, actor_label, action, resource, metadata) VALUES (?, ?, ?, ?, ?)')
      .run(userId, actorLabel, action, resource, metadata ? JSON.stringify(metadata) : null);
  } catch (err) {
    // Logging must never break the actual request it's attached to.
    console.error('audit log write failed:', err.message);
  }
}

module.exports = { logAction };
