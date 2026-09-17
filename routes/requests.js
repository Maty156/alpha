const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { logAction } = require('../utils/auditLog');

const router = express.Router();

const requestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// ---------- POST /api/assessment-requests — public, no auth ----------
router.post('/', requestLimiter, async (req, res, next) => {
  try {
    const { name, email, companyName, message, assessmentType, preferredDate, website, formRenderedAt } = req.body || {};

    // Same bot protections as registration: honeypot + minimum-fill-time check.
    if (website) {
      return res.status(400).json({ error: 'Request failed. Please try again.' });
    }
    const elapsed = Date.now() - Number(formRenderedAt || 0);
    if (formRenderedAt && (elapsed < 1500 || Number.isNaN(elapsed))) {
      return res.status(400).json({ error: 'Request failed. Please try again.' });
    }

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required.' });
    }

    const info = await db
      .prepare(`
        INSERT INTO assessment_requests (name, email, company_name, message, assessment_type, preferred_date)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(
        String(name).slice(0, 200).trim(),
        String(email).slice(0, 200).trim().toLowerCase(),
        companyName ? String(companyName).slice(0, 200).trim() : null,
        message ? String(message).slice(0, 2000).trim() : null,
        assessmentType ? String(assessmentType).slice(0, 100).trim() : null,
        preferredDate ? String(preferredDate).slice(0, 40) : null
      );

    await logAction({
      actorLabel: `public:${String(email).toLowerCase().trim()}`,
      action: 'request.created',
      resource: `assessment_request:${info.lastInsertRowid}`,
      metadata: { companyName: companyName || null },
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
