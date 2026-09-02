const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';

function requireAuth(req, res, next) {
  const token = req.cookies?.alpha_session;
  if (!token) {
    return res.status(401).json({ error: 'Not signed in.' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, email, companyName }
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

// Same as requireAuth but doesn't 401 — just leaves req.user undefined if not signed in.
function optionalAuth(req, res, next) {
  const token = req.cookies?.alpha_session;
  if (!token) return next();
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch {
    // ignore invalid/expired token, treat as logged out
  }
  next();
}

module.exports = { requireAuth, optionalAuth, JWT_SECRET };
