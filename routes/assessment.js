const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

// ---------- GET /api/assessment ----------
// A signed-in client's real status. Never returns fake findings for an
// account that hasn't actually had an assessment performed.
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const user = await db
      .prepare('SELECT assessment_completed, assessment_data, report_filename FROM users WHERE id = ?')
      .get(req.user.id);

    if (!user || !user.assessment_completed) {
      return res.json({
        completed: false,
        message: 'Your security assessment has not been completed yet. Contact Alpha to schedule an authorized assessment.',
      });
    }

    let data = null;
    try {
      data = JSON.parse(user.assessment_data);
    } catch {
      data = null;
    }

    res.json({ completed: true, data, hasReport: !!user.report_filename });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
