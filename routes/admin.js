const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAdmin } = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAdmin);

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      cb(null, `report-${req.params.id}-${Date.now()}.pdf`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are accepted.'));
    }
    cb(null, true);
  },
});

// ---------- GET /api/admin/clients ----------
router.get('/clients', (req, res) => {
  const rows = db
    .prepare(`
      SELECT id, company_name, email, assessment_completed, created_at
      FROM users
      WHERE role = 'client'
      ORDER BY created_at DESC
    `)
    .all();

  res.json({
    clients: rows.map(r => ({
      id: r.id,
      companyName: r.company_name,
      email: r.email,
      assessmentCompleted: !!r.assessment_completed,
      createdAt: r.created_at,
    })),
  });
});

// ---------- GET /api/admin/clients/:id ----------
router.get('/clients/:id', (req, res) => {
  const user = db
    .prepare(`SELECT id, company_name, email, assessment_completed, assessment_data, report_filename FROM users WHERE id = ? AND role = 'client'`)
    .get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Client not found.' });

  let data = null;
  try { data = JSON.parse(user.assessment_data); } catch { data = null; }

  res.json({
    client: {
      id: user.id,
      companyName: user.company_name,
      email: user.email,
      assessmentCompleted: !!user.assessment_completed,
      assessmentData: data,
      reportFilename: user.report_filename,
    },
  });
});

// ---------- PUT /api/admin/clients/:id/assessment ----------
// Body: { completed: boolean, machines, users, critical, high, attackPath: string[] }
router.put('/clients/:id/assessment', (req, res) => {
  const { completed, machines, users, critical, high, attackPath } = req.body || {};

  const client = db.prepare(`SELECT id FROM users WHERE id = ? AND role = 'client'`).get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found.' });

  if (!completed) {
    db.prepare('UPDATE users SET assessment_completed = 0, assessment_data = NULL, assessment_completed_at = NULL WHERE id = ?').run(req.params.id);
    return res.json({ ok: true });
  }

  const data = {
    machines: Number(machines) || 0,
    users: Number(users) || 0,
    critical: Number(critical) || 0,
    high: Number(high) || 0,
    attackPath: Array.isArray(attackPath)
      ? attackPath.filter(Boolean)
      : String(attackPath || '').split(',').map(s => s.trim()).filter(Boolean),
  };

  db.prepare('UPDATE users SET assessment_completed = 1, assessment_data = ?, assessment_completed_at = COALESCE(assessment_completed_at, datetime(\'now\')) WHERE id = ?')
    .run(JSON.stringify(data), req.params.id);

  res.json({ ok: true, data });
});

// ---------- POST /api/admin/clients/:id/report — upload the client's report PDF ----------
router.post('/clients/:id/report', upload.single('report'), (req, res) => {
  const client = db.prepare(`SELECT id, report_filename FROM users WHERE id = ? AND role = 'client'`).get(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  // clean up the old file if one existed
  if (client.report_filename) {
    const oldPath = path.join(UPLOAD_DIR, client.report_filename);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  db.prepare('UPDATE users SET report_filename = ? WHERE id = ?').run(req.file.filename, req.params.id);
  res.json({ ok: true, filename: req.file.filename });
});

// ---------- GET /api/admin/messages ----------
// All threads, grouped by client, most recently active first.
router.get('/messages', (req, res) => {
  const clients = db
    .prepare(`SELECT id, company_name, email FROM users WHERE role = 'client'`)
    .all();

  const threads = clients.map(c => {
    const messages = db
      .prepare('SELECT id, sender, body, created_at FROM messages WHERE user_id = ? ORDER BY created_at ASC')
      .all(c.id);
    return {
      userId: c.id,
      companyName: c.company_name,
      email: c.email,
      messages,
      lastActivity: messages.length ? messages[messages.length - 1].created_at : null,
    };
  }).filter(t => t.messages.length > 0)
    .sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));

  res.json({ threads });
});

// ---------- POST /api/admin/messages/:userId ----------
router.post('/messages/:userId', (req, res) => {
  const { body } = req.body || {};
  if (!body || !body.trim()) return res.status(400).json({ error: 'Message cannot be empty.' });

  const client = db.prepare(`SELECT id FROM users WHERE id = ? AND role = 'client'`).get(req.params.userId);
  if (!client) return res.status(404).json({ error: 'Client not found.' });

  db.prepare('INSERT INTO messages (user_id, sender, body) VALUES (?, ?, ?)')
    .run(req.params.userId, 'admin', body.trim());
  res.status(201).json({ ok: true });
});

module.exports = router;
