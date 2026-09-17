const express = require('express');
const multer = require('multer');
const db = require('../db');
const { requireAdmin } = require('../middleware/requireAuth');
const { certificateId } = require('../utils/certificate');
const { logAction } = require('../utils/auditLog');
const { sanitizeFinding, computeSeverityCounts } = require('../utils/findings');
const { ingestEvent } = require('../utils/detectionRules');

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
// Body: { completed: boolean, machines, users, attackPath: string[], findings?: [...] }
// If `findings` is provided (non-empty array), severity counts (critical/high/
// medium/low/informational) are computed FROM the findings, not manually
// entered — that's the whole point of structured findings. If `findings` is
// omitted (older admin flow, or an assessment that predates this feature),
// the old manual `critical`/`high` numbers still work exactly as before.
router.put('/clients/:id/assessment', async (req, res, next) => {
  try {
    const { completed, machines, users, critical, high, attackPath, findings } = req.body || {};

    const client = await db.prepare(`SELECT id, company_name FROM users WHERE id = ? AND role = 'client'`).get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found.' });

    if (!completed) {
      await db.prepare('UPDATE users SET assessment_completed = 0, assessment_data = NULL, assessment_completed_at = NULL WHERE id = ?').run(req.params.id);
      await logAction({
        userId: req.user.id,
        actorLabel: `admin:${req.user.email}`,
        action: 'assessment.reset',
        resource: `user:${req.params.id}`,
      });
      return res.json({ ok: true });
    }

    const sanitizedFindings = Array.isArray(findings) ? findings.map(sanitizeFinding) : [];
    const severityCounts = computeSeverityCounts(sanitizedFindings);

    const data = {
      machines: Number(machines) || 0,
      users: Number(users) || 0,
      // Backward compatible: if findings were actually provided, counts come
      // from them. Otherwise, fall back to whatever numbers were typed in
      // manually (the pre-findings behavior).
      critical: sanitizedFindings.length ? severityCounts.critical : (Number(critical) || 0),
      high: sanitizedFindings.length ? severityCounts.high : (Number(high) || 0),
      severityCounts: sanitizedFindings.length ? severityCounts : null,
      findings: sanitizedFindings,
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

    await logAction({
      userId: req.user.id,
      actorLabel: `admin:${req.user.email}`,
      action: 'assessment.completed',
      resource: `user:${req.params.id}`,
      metadata: { companyName: client.company_name, findingsCount: sanitizedFindings.length },
    });

    res.json({ ok: true, data });
  } catch (err) {
    next(err);
  }
});

// ---------- POST /api/admin/clients/:id/report — upload the client's report PDF ----------
router.post('/clients/:id/report', upload.single('report'), async (req, res, next) => {
  try {
    const client = await db.prepare(`SELECT id, company_name FROM users WHERE id = ? AND role = 'client'`).get(req.params.id);
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    await db.prepare('UPDATE users SET report_filename = ?, report_data = ? WHERE id = ?')
      .run(req.file.originalname || 'report.pdf', req.file.buffer, req.params.id);

    await logAction({
      userId: req.user.id,
      actorLabel: `admin:${req.user.email}`,
      action: 'report.uploaded',
      resource: `user:${req.params.id}`,
      metadata: { companyName: client.company_name, filename: req.file.originalname, sizeBytes: req.file.size },
    });

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

// ---------- GET /api/admin/requests ----------
const REQUEST_STATUSES = ['Pending', 'Approved', 'Scheduled', 'In Progress', 'Completed', 'Cancelled'];

router.get('/requests', async (req, res, next) => {
  try {
    const rows = await db
      .prepare('SELECT * FROM assessment_requests ORDER BY created_at DESC')
      .all();
    res.json({
      requests: rows.map(r => ({
        id: r.id,
        name: r.name,
        email: r.email,
        companyName: r.company_name,
        message: r.message,
        assessmentType: r.assessment_type,
        preferredDate: r.preferred_date,
        status: r.status,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------- PUT /api/admin/requests/:id ----------
router.put('/requests/:id', async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!REQUEST_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${REQUEST_STATUSES.join(', ')}` });
    }

    const existing = await db.prepare('SELECT id, company_name, email FROM assessment_requests WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Request not found.' });

    await db.prepare('UPDATE assessment_requests SET status = ? WHERE id = ?').run(status, req.params.id);

    await logAction({
      userId: req.user.id,
      actorLabel: `admin:${req.user.email}`,
      action: 'request.status_changed',
      resource: `assessment_request:${req.params.id}`,
      metadata: { companyName: existing.company_name, email: existing.email, newStatus: status },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------- GET /api/admin/audit-logs ----------
router.get('/audit-logs', async (req, res, next) => {
  try {
    const rows = await db
      .prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200')
      .all();
    res.json({
      logs: rows.map(r => ({
        id: r.id,
        userId: r.user_id,
        actorLabel: r.actor_label,
        action: r.action,
        resource: r.resource,
        metadata: r.metadata ? JSON.parse(r.metadata) : null,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ==================================================
// DETECTION ENGINE — admin side
// ==================================================
const ALERT_STATUSES = ['New', 'Investigating', 'Resolved', 'False Positive'];

// ---------- GET /api/admin/alerts ----------
router.get('/alerts', async (req, res, next) => {
  try {
    const rows = await db
      .prepare(`
        SELECT a.*, e.source AS event_source, e.raw_data AS event_raw_data
        FROM alerts a
        LEFT JOIN security_events e ON e.id = a.event_id
        ORDER BY a.created_at DESC
        LIMIT 200
      `)
      .all();

    res.json({
      alerts: rows.map(r => ({
        id: r.id,
        title: r.title,
        severity: r.severity,
        mitreTechnique: r.mitre_technique,
        description: r.description,
        status: r.status,
        investigationNotes: r.investigation_notes,
        promotedFindingClientId: r.promoted_finding_client_id,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at,
        eventSource: r.event_source,
        eventData: r.event_raw_data ? JSON.parse(r.event_raw_data) : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ---------- PUT /api/admin/alerts/:id ----------
// Body: { status, investigationNotes }
router.put('/alerts/:id', async (req, res, next) => {
  try {
    const { status, investigationNotes } = req.body || {};
    if (status && !ALERT_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${ALERT_STATUSES.join(', ')}` });
    }

    const existing = await db.prepare('SELECT id FROM alerts WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Alert not found.' });

    const resolvedAt = status === 'Resolved' ? new Date().toISOString() : null;

    await db
      .prepare('UPDATE alerts SET status = COALESCE(?, status), investigation_notes = ?, resolved_at = ? WHERE id = ?')
      .run(status || null, investigationNotes != null ? String(investigationNotes).slice(0, 4000) : null, resolvedAt, req.params.id);

    await logAction({
      userId: req.user.id,
      actorLabel: `admin:${req.user.email}`,
      action: 'alert.updated',
      resource: `alert:${req.params.id}`,
      metadata: { status },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ---------- POST /api/admin/alerts/:id/promote ----------
// Body: { clientId, recommendation? }
// Turns an investigated alert into a real finding on a specific client's
// assessment. The client must already have a completed assessment — this
// adds to it, it doesn't silently start one on their behalf.
router.post('/alerts/:id/promote', async (req, res, next) => {
  try {
    const { clientId, recommendation } = req.body || {};

    const alert = await db.prepare('SELECT * FROM alerts WHERE id = ?').get(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found.' });

    const client = await db.prepare(`SELECT id, company_name, assessment_completed, assessment_data FROM users WHERE id = ? AND role = 'client'`).get(clientId);
    if (!client) return res.status(404).json({ error: 'Client not found.' });
    if (!client.assessment_completed) {
      return res.status(400).json({ error: 'That client does not have a completed assessment yet — mark one complete first, then promote alerts into it.' });
    }

    let data;
    try {
      data = JSON.parse(client.assessment_data) || {};
    } catch {
      data = {};
    }
    const existingFindings = Array.isArray(data.findings) ? data.findings : [];

    const newFinding = sanitizeFinding({
      title: alert.title,
      severity: alert.severity,
      category: 'Detection / Blue Team',
      description: alert.description,
      evidence: `Detected by the ALPHA detection engine (rule: ${alert.rule_key}). ${alert.mitre_technique || ''}`.trim(),
      recommendation: recommendation || '',
      status: 'Open',
    });

    const updatedFindings = [...existingFindings, newFinding];
    const severityCounts = computeSeverityCounts(updatedFindings);

    const updatedData = {
      ...data,
      findings: updatedFindings,
      severityCounts,
      critical: severityCounts.critical,
      high: severityCounts.high,
    };

    await db.prepare('UPDATE users SET assessment_data = ? WHERE id = ?').run(JSON.stringify(updatedData), clientId);
    await db.prepare('UPDATE alerts SET promoted_finding_client_id = ? WHERE id = ?').run(clientId, req.params.id);

    await logAction({
      userId: req.user.id,
      actorLabel: `admin:${req.user.email}`,
      action: 'alert.promoted_to_finding',
      resource: `alert:${req.params.id}`,
      metadata: { clientId: Number(clientId), companyName: client.company_name },
    });

    res.json({ ok: true, finding: newFinding });
  } catch (err) {
    next(err);
  }
});

// ---------- POST /api/admin/simulate ----------
// Fires one synthetic event per rule through the exact same ingestEvent()
// pipeline the real collector uses — same detection logic, same alert
// creation. Only the event *source* is fake; everything downstream is real.
router.post('/simulate', async (req, res, next) => {
  try {
    const now = () => new Date().toISOString();
    const results = [];

    // 1. Password spraying — 5 distinct accounts failing from one source
    const sprayAccounts = ['jsmith', 'agarcia', 'mchen', 'rkhan', 'ltaylor'];
    for (const account of sprayAccounts) {
      results.push(await ingestEvent({
        source: 'simulator', eventId: '4625', timestamp: now(),
        accountName: account, sourceIp: '10.10.10.50', hostname: 'DC01',
      }));
    }

    // 2. Privilege escalation
    results.push(await ingestEvent({
      source: 'simulator', eventId: '4728', timestamp: now(),
      accountName: 'svc-helpdesk', targetGroup: 'Domain Admins', hostname: 'DC01',
    }));

    // 3. Kerberoasting
    results.push(await ingestEvent({
      source: 'simulator', eventId: '4769', timestamp: now(),
      accountName: 'jsmith', serviceName: 'MSSQLSvc/db01.alpha.local', encryptionType: '0x17', hostname: 'DC01',
    }));

    // 4. Suspicious remote logon
    results.push(await ingestEvent({
      source: 'simulator', eventId: '4624', timestamp: now(),
      accountName: 'administrator', sourceIp: '203.0.113.44', logonType: '10', hostname: 'WORKSTATION01',
    }));

    // 5. Service abuse
    results.push(await ingestEvent({
      source: 'simulator', eventId: '4697', timestamp: now(),
      accountName: 'svc-helpdesk', serviceName: 'UpdateHelper',
      serviceBinaryPath: 'C:\\Users\\Public\\update.exe -enc SGVsbG8=', hostname: 'WORKSTATION01',
    }));

    const alertsFired = results.filter(r => r.alertId).length;

    await logAction({
      userId: req.user.id,
      actorLabel: `admin:${req.user.email}`,
      action: 'detection.simulation_run',
      metadata: { eventsProcessed: results.length, alertsFired },
    });

    res.json({ ok: true, eventsProcessed: results.length, alertsFired });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
