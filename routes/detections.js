const express = require('express');
const { requireCollectorKey } = require('../middleware/requireCollectorKey');
const { ingestEvent } = require('../utils/detectionRules');
const { logAction } = require('../utils/auditLog');

const router = express.Router();

// ---------- POST /api/detections/ingest ----------
// Body: a single event object, or an array of them.
// Authenticated via the X-Alpha-Collector-Key header (see middleware),
// not the human JWT cookie — this is a machine-to-machine endpoint.
router.post('/ingest', requireCollectorKey, async (req, res, next) => {
  try {
    const events = Array.isArray(req.body) ? req.body : [req.body];
    const results = [];

    for (const evt of events) {
      if (!evt || !evt.eventId) continue;
      results.push(await ingestEvent({ source: 'collector', ...evt }));
    }

    const alertsFired = results.filter(r => r.alertId).length;
    if (alertsFired > 0) {
      await logAction({
        actorLabel: 'collector:script',
        action: 'detection.alert_created',
        metadata: { alertsFired, eventsProcessed: results.length },
      });
    }

    res.status(201).json({ ok: true, processed: results.length, alertsFired });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
