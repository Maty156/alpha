const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/requireAuth');
const { generateCertificate } = require('../utils/certificate');

const router = express.Router();

// ---------- GET /api/report — the signed-in client's own uploaded report ----------
router.get('/report', requireAuth, async (req, res, next) => {
  try {
    const user = await db
      .prepare('SELECT report_filename, report_data, company_name FROM users WHERE id = ?')
      .get(req.user.id);

    if (!user || !user.report_data) {
      return res.status(404).json({ error: 'No report has been uploaded for your account yet.' });
    }

    const niceName = `alpha-report-${user.company_name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${niceName}"`);

    // libSQL returns BLOB columns as ArrayBuffer — normalize to a Buffer before sending
    const buf = Buffer.isBuffer(user.report_data)
      ? user.report_data
      : Buffer.from(user.report_data);
    res.send(buf);
  } catch (err) {
    next(err);
  }
});

// ---------- GET /api/certificate — auto-generated, only if assessment is complete ----------
router.get('/certificate', requireAuth, async (req, res, next) => {
  try {
    const user = await db
      .prepare('SELECT company_name, assessment_completed, assessment_completed_at, certificate_id FROM users WHERE id = ?')
      .get(req.user.id);

    if (!user || !user.assessment_completed) {
      return res.status(403).json({ error: 'Your assessment must be completed before a certificate is available.' });
    }

    const verifyUrl = `${req.protocol}://${req.get('host')}/verify.html?code=${user.certificate_id}`;

    await generateCertificate(res, {
      userId: req.user.id,
      companyName: user.company_name,
      completedAt: user.assessment_completed_at || new Date().toISOString(),
      certificateId: user.certificate_id,
      verifyUrl,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
