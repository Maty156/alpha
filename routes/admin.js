const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAdmin } = require('../middleware/requireAuth');
const { certificateId } = require('../utils/certificate');

const router = express.Router();
router.use(requireAdmin);

// Reports are stored as a BLOB in the database, not on local disk — a
// serverless host like Vercel has no writable/persistent filesystem, so
// memory storage + a DB column is the only option that works everywhere
// (local dev, Render/Railway, and Vercel) without special-casing per host.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are accepted.'));
    }
    cb(null, true);
  },
});

// ---------- GET /api/admin/clients ----------
router.get('/clients', async (req, res, next) => {
  try {
    const rows = await db
      .prepare(`
        SELECT id, company_name, contact_name, email, assessment_completed, created_at
        FROM users
        WHERE role = 'client'
        ORDER BY created_at DESC
      `)
      .all();

    res.json({
      clients: rows.map(r => ({
        id: r.id,
        companyName: r.company_name,
        contactName: r.contact_name,
        email: r.email,
        assessmentCompleted: !!r.assessment_completed,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------- GET /api/admin/clients/:id ----------
router.get('/clients/:id', async (req, res, next) => {
  try {
    const user = await db
      .prepare(`SELECT id, company_name, contact_name, email, assessment_completed, assessment_data, report_filename FROM users WHERE id = ? AND role = 'client'`)
      .get(req.params.id);
    if (!user) return res.status(404).json({ error: 'Client not found.' });

    let data = null;
    try { data = JSON.parse(user.assessment_data); } catch { data = null; }

    res.json({
      client: {
        id: user.id,
        companyName: user.company_name,
        contactName: user.contact_name,
        email: user.email,
        assessmentCompleted: !!user.assessment_completed,
        assessmentData: data,
        reportFilename: user.report_filename,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ---------- PUT /api/admin/clients/:id/assessment ----------
// Body: { completed: boolean, machines, users, critical, high, attackPath: string[] }
router.put('/clients/:id/assessment', async (req, res, next) => {
  try {
    const { completed, machines, users, critical, high, attackPath } = req.body || {};

    const client = await db.prepare(`SELECT id FROM users WHERE id = ? AND role = 'client'`).get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    if (!completed) {
      await db.prepare('UPDATE users SET assessment_completed = 0, assessment_data = NULL, assessment_completed_at = NULL WHERE id = ?').run(req.params.id);
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

    await db.prepare('UPDATE users SET assessment_completed = 1, assessment_data = ?, assessment_completed_at = COALESCE(assessment_completed_at, datetime(\'now\')) WHERE id = ?')
      .run(JSON.stringify(data), req.params.id);

    // stamp a stable certificate_id tied to this specific completion date
    const row = await db.prepare('SELECT assessment_completed_at FROM users WHERE id = ?').get(req.params.id);
    const certId = certificateId(req.params.id, row.assessment_completed_at);
    await db.prepare('UPDATE users SET certificate_id = ? WHERE id = ?').run(certId, req.params.id);

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

// ---------- POST /api/admin/clients/:id/report — upload the client's report PDF ----------
router.post('/clients/:id/report', upload.single('report'), async (req, res, next) => {
  try {
    const client = await db.prepare(`SELECT id FROM users WHERE id = ? AND role = 'client'`).get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    await db.prepare('UPDATE users SET report_filename = ?, report_data = ? WHERE id = ?')
      .run(req.file.originalname || 'report.pdf', req.file.buffer, req.params.id);

    res.json({ ok: true, filename: req.file.originalname });
  } catch (err) {
    next(err);
  }
});

// ---------- GET /api/admin/messages ----------
// All threads, grouped by client, most recently active first.
router.get('/messages', async (req, res, next) => {
  try {
    const clients = await db
      .prepare(`SELECT id, company_name, email FROM users WHERE role = 'client'`)
      .all();

    const threads = [];
    for (const c of clients) {
      const messages = await db
        .prepare('SELECT id, sender, body, created_at FROM messages WHERE user_id = ? ORDER BY created_at ASC')
        .all(c.id);
      if (messages.length === 0) continue;
      threads.push({
        userId: c.id,
        companyName: c.company_name,
        email: c.email,
        messages,
        lastActivity: messages[messages.length - 1].created_at,
      });
    }
    threads.sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));

    res.json({ threads });
  } catch (err) {
    next(err);
  }
});

// ---------- POST /api/admin/messages/:userId ----------
router.post('/messages/:userId', async (req, res, next) => {
  try {
    const { body } = req.body || {};
    if (!body || !body.trim()) return res.status(400).json({ error: 'Message cannot be empty.' });

    const client = await db.prepare(`SELECT id FROM users WHERE id = ? AND role = 'client'`).get(req.params.userId);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    await db.prepare('INSERT INTO messages (user_id, sender, body) VALUES (?, ?, ?)')
      .run(req.params.userId, 'admin', body.trim());
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
