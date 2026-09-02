const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

// ---------- GET /api/messages — the signed-in client's own thread ----------
router.get('/', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT id, sender, body, created_at FROM messages WHERE user_id = ? ORDER BY created_at ASC')
    .all(req.user.id);
  res.json({ messages: rows });
});

// ---------- POST /api/messages — send a message to Alpha ----------
router.post('/', requireAuth, (req, res) => {
  const { body } = req.body || {};
  if (!body || !body.trim()) {
    return res.status(400).json({ error: 'Message cannot be empty.' });
  }
  db.prepare('INSERT INTO messages (user_id, sender, body) VALUES (?, ?, ?)')
    .run(req.user.id, 'client', body.trim());
  res.status(201).json({ ok: true });
});

module.exports = router;
