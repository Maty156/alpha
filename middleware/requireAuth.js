const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';

if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'dev-only-secret-change-me') {
  console.error(
    '\n*** SECURITY WARNING ***\n' +
    'JWT_SECRET is not set — running in production with the placeholder ' +
    'development secret. Anyone who knows this value could forge session ' +
    'cookies. Set a real JWT_SECRET environment variable.\n'
  );
}

function requireAuth(req, res, next) {
  const token = req.cookies?.alpha_session;
  if (!token) {
    return res.status(401).json({ error: 'Not signed in.' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, email, companyName, role }
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access only.' });
    }
    next();
  });
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

module.exports = { requireAuth, requireAdmin, optionalAuth, JWT_SECRET };
