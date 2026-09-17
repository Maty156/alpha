const COLLECTOR_API_KEY = process.env.COLLECTOR_API_KEY || null;

function requireCollectorKey(req, res, next) {
  if (!COLLECTOR_API_KEY) {
    return res.status(503).json({ error: 'Event collection is not configured on this server yet (COLLECTOR_API_KEY not set).' });
  }
  const provided = req.headers['x-alpha-collector-key'];
  if (!provided || provided !== COLLECTOR_API_KEY) {
    return res.status(401).json({ error: 'Invalid or missing collector key.' });
  }
  next();
}

module.exports = { requireCollectorKey };
