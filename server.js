require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const db = require('./db');
const authRoutes = require('./routes/auth');
const assessmentRoutes = require('./routes/assessment');
const messagesRoutes = require('./routes/messages');
const adminRoutes = require('./routes/admin');
const reportsRoutes = require('./routes/reports');
const verifyRoutes = require('./routes/verify');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());

// Serve the frontend (index.html, styles.css, script.js, assets/) as-is
app.use(express.static(path.join(__dirname, 'public')));

// Every request waits for the DB to be ready first. On Vercel this runs
// once per cold start (fast after that); locally/on Render it resolves
// once at boot and every request after that is instant.
app.use(async (req, res, next) => {
  try {
    await db.init();
    next();
  } catch (err) {
    console.error('DB init failed:', err);
    res.status(500).json({ error: 'Database is not reachable.' });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/assessment', assessmentRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', reportsRoutes);
app.use('/api/verify', verifyRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// JSON error handler — keeps things like multer's file-type rejection from
// leaking a raw stack trace to the browser.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 400).json({ error: err.message || 'Something went wrong.' });
});

// Run a normal persistent server locally / on Render / on Railway.
// On Vercel, this file is imported as a serverless function instead —
// app.listen() is simply never called there, Vercel calls the exported
// app directly per-request.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Alpha Cybersecurity server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
