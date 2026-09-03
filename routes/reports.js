const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { requireAuth } = require('../middleware/requireAuth');
const { generateCertificate } = require('../utils/certificate');

const router = express.Router();
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

// ---------- GET /api/report — the signed-in client's own uploaded report ----------
router.get('/report', requireAuth, (req, res) => {
  const user = db.prepare('SELECT report_filename, company_name FROM users WHERE id = ?').get(req.user.id);
  if (!user || !user.report_filename) {
    return res.status(404).json({ error: 'No report has been uploaded for your account yet.' });
  }
  const filePath = path.join(UPLOAD_DIR, user.report_filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Report file is missing on the server.' });
  }
  const niceName = `alpha-report-${user.company_name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`;
  res.download(filePath, niceName);
});

// ---------- GET /api/certificate — auto-generated, only if assessment is complete ----------
router.get('/certificate', requireAuth, async (req, res) => {
  const user = db
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
});

module.exports = router;
