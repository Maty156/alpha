const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

// ---------- GET /api/assessment ----------
// A signed-in client's real status. Never returns fake findings for an
// account that hasn't actually had an assessment performed.
router.get('/', requireAuth, (req, res) => {
  const user = db.prepare('SELECT assessment_completed FROM users WHERE id = ?').get(req.user.id);

  if (!user || !user.assessment_completed) {
    return res.json({
      completed: false,
      message: 'Your security assessment has not been completed yet. Contact Alpha to schedule an authorized assessment.',
    });
  }

  // Placeholder shape for when an assessment is actually marked complete
  // (that flag is currently only set by hand in the DB — no UI for it yet,
  // since we don't have a real engagement workflow built).
  res.json({
    completed: true,
    data: {
      machines: 4,
      users: 27,
      critical: 5,
      high: 8,
      attackPath: ['USER01', 'WORKSTATION01', 'SERVICE01', 'DOMAIN ADMIN'],
    },
  });
});

module.exports = router;
