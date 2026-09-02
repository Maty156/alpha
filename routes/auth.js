const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { JWT_SECRET, requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production', // requires HTTPS in prod (Render/Railway provide this)
  maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
};

function issueSession(res, user) {
  const token = jwt.sign(
    { id: user.id, email: user.email, companyName: user.company_name, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  res.cookie('alpha_session', token, COOKIE_OPTS);
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    companyName: user.company_name,
    role: user.role,
    assessmentCompleted: !!user.assessment_completed,
  };
}

// ---------- POST /api/auth/register ----------
router.post('/register', (req, res) => {
  const { companyName, email, password } = req.body || {};

  if (!companyName || !email || !password) {
    return res.status(400).json({ error: 'Company name, email, and password are all required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare('INSERT INTO users (company_name, email, password_hash) VALUES (?, ?, ?)')
    .run(companyName.trim(), email.toLowerCase().trim(), passwordHash);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  issueSession(res, user);
  res.status(201).json({ user: publicUser(user) });
});

// ---------- POST /api/auth/login ----------
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }

  issueSession(res, user);
  res.json({ user: publicUser(user) });
});

// ---------- POST /api/auth/logout ----------
router.post('/logout', (req, res) => {
  const { maxAge, ...clearOpts } = COOKIE_OPTS;
  res.clearCookie('alpha_session', clearOpts);
  res.json({ ok: true });
});

// ---------- GET /api/auth/me ----------
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: 'Session invalid.' });
  res.json({ user: publicUser(user) });
});

module.exports = router;
