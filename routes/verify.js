const express = require('express');
const db = require('../db');

const router = express.Router();

// ---------- GET /api/verify/:code — public, no auth ----------
router.get('/:code', async (req, res, next) => {
  try {
    const user = await db
      .prepare(`SELECT company_name, assessment_completed_at FROM users WHERE certificate_id = ?`)
      .get(req.params.code);

    if (!user) {
      return res.json({ valid: false });
    }

    res.json({
      valid: true,
      companyName: user.company_name,
      completedAt: user.assessment_completed_at,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
