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

- **Real:** account registration (requires a contact person's name), login, logout,
  sessions (httpOnly JWT cookie), password hashing (bcrypt), a **password strength
  meter** on the registration form (with a real server-side minimum: 8+ characters,
  letters and numbers required — not just cosmetic), **basic bot protection**
  (a honeypot field plus a minimum-fill-time check that rejects instant/scripted
  submissions) and **rate limiting** on login/register (429 after too many attempts
  from the same IP), password-confirmation + show/hide toggle, role-based access
  (client vs. admin), a per-account assessment status endpoint that never shows
  fake findings to an untested client, a client dashboard showing the real contact
  person's name, a live message thread to Alpha, a full **admin panel**
  (`/admin.html`), PDF report upload/download, and an auto-generated completion
  certificate with a real scannable QR code linking to a public verification page.
- **Not built yet:** no email sending. No password reset flow. The bot protection
  is basic (honeypot + timing + rate limit) — good enough to stop naive scripts
  and casual abuse, not a full CAPTCHA-grade defense against a determined attacker.

## Delivering a report + certificate to a client

1. Admin panel → Clients tab → select the client → fill in the assessment fields → **Save**.
2. Same panel, right below the form → **Upload report (PDF)** → pick the actual report file → Upload.
3. The client now sees, on their dashboard's Assessment tab:
   - Their real findings (from step 1)
   - A **Download Certificate** button — generates a PDF certificate on the fly, no manual work needed
   - A **Download Full Report** button — only appears once you've uploaded a file in step 2

The certificate is regenerated fresh every time it's downloaded (not stored as a
file), so if you ever change the completion date or company name, the next
download reflects it automatically.

There's no public "sign up as admin" form on purpose — admins are created from
the server directly:

```bash
node scripts/create-admin.js "Alpha Internal" admin@yourdomain.com somepassword
```

Log in with those credentials at `/` (the same Client Login modal) — the server
recognizes the `admin` role and redirects to `/admin.html` instead of the client
dashboard automatically. Regular visitors registering through the site always get
a `client` role; there's no way to self-register as admin.

## Marking an assessment complete

Do this from the admin panel now (`/admin.html` → Clients tab → select a client →
fill in machines/users/critical/high/attack path → Save) rather than hand-editing
the database. The manual DB approach from earlier still works too if you ever need it:
```bash
node -e "require('./db').prepare('UPDATE users SET assessment_completed = 1 WHERE email = ?').run('client@example.com')"
```

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
