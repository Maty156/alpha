# Alpha Cybersecurity — Backend

Express server that serves the frontend (`public/`) and a small client-account API
(register, login, logout, assessment status). SQLite database, no external DB service
required.

## Run locally

```bash
npm install
cp .env.example .env    # then edit JWT_SECRET to something random
npm start
```

Visit http://localhost:3000 — the site and the API run from the same server.

## What's real vs. what's not

- **Real:** account registration, login, logout, sessions (httpOnly JWT cookie),
  password hashing (bcrypt), a per-account assessment status endpoint that
  correctly refuses to show fake findings to an account that hasn't had a real
  assessment, and a client dashboard page (`dashboard.html`) that requires a
  valid session (redirects to `/` if you're not signed in).
- **Not built yet:** there's no admin interface to actually mark an assessment
  "completed" for a client — that's a manual DB edit for now. If you have the
  `sqlite3` CLI installed:
  ```bash
  sqlite3 data.sqlite "UPDATE users SET assessment_completed = 1 WHERE email = 'client@example.com';"
  ```
  If you don't (common on fresh installs), use this instead:
  ```bash
  node -e "require('./db').prepare('UPDATE users SET assessment_completed = 1 WHERE email = ?').run('client@example.com')"
  ```
  No email sending. No password reset flow.

## One tradeoff worth knowing

The database is a single SQLite file (`data.sqlite`) sitting next to the server.
On hosts with **ephemeral storage** (e.g. Render's free web service tier), this file
gets wiped every time you redeploy — fine for a demo, but you'll lose registered
accounts on each redeploy. If you need accounts to survive redeploys:
- Render: add a paid persistent disk, mount it, and point the DB path at it, **or**
- Railway: attach a volume (available on the free/hobby tier), **or**
- Swap SQLite for a managed Postgres later — the `db.js` file is the only place
  that would need to change, since all the routes just call `db.prepare(...)`.

## Deploying (Render example)

1. Push this folder to a GitHub repo.
2. Render → New → Web Service → connect the repo.
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add environment variable `JWT_SECRET` (long random string) and `NODE_ENV=production`.
6. Deploy. Render gives you a `https://your-app.onrender.com` URL — that's your live site.

Railway works almost identically (it auto-detects the start command from `package.json`).
