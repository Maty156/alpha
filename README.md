# Alpha Cybersecurity — Backend

Express server that serves the frontend (`public/`) and a client-account API
(register, login, logout, assessment status, admin panel, messaging, reports,
certificates). Database is SQLite-compatible via `@libsql/client` — locally it
just uses a plain file, no setup needed; in production it points at a free
**Turso** database instead, since serverless hosts like Vercel have no writable
disk to keep a local SQLite file on.

## Run locally

```bash
npm install
cp .env.example .env    # then edit JWT_SECRET to something random
npm start
```

Visit http://localhost:3000 — the site and the API run from the same server,
using a local `data.sqlite` file. No Turso account needed for local dev.

## Deploying to Vercel (with Turso)

Vercel functions have **no persistent local filesystem** — a local SQLite file
would get wiped on every request, and uploaded report files would vanish
immediately. This backend is built to handle that: the database goes to Turso
(a hosted, SQLite-compatible database, same SQL you already see in the code),
and uploaded reports are stored as binary data inside the database instead of
on disk.

**1. Create a free Turso database**
```bash
# install the Turso CLI (see https://docs.turso.tech/cli/installation for your OS)
turso auth login
turso db create alpha-cybersecurity
turso db show alpha-cybersecurity --url        # copy this → TURSO_DATABASE_URL
turso db tokens create alpha-cybersecurity     # copy this → TURSO_AUTH_TOKEN
```

**2. Deploy to Vercel**
- Push this `backend` folder to a GitHub repo
- Vercel → New Project → import the repo
- Vercel should auto-detect `vercel.json` (already included) and use it
- Add environment variables in the Vercel project settings:
  - `TURSO_DATABASE_URL` — from step 1
  - `TURSO_AUTH_TOKEN` — from step 1
  - `JWT_SECRET` — any long random string
  - `NODE_ENV` — `production`
- Deploy. Vercel gives you a `https://your-app.vercel.app` URL — that's your live site.

**3. Create your admin account against the live database**

Run this from your own machine, not on Vercel — it just needs the same two
Turso env vars set locally so it talks to your real production database instead
of your local dev file:
```bash
TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... \
  node scripts/create-admin.js "Alpha Internal" admin@yourdomain.com somepassword
```

That's it — no code changes needed between local dev and production, same
`db.prepare(...)` calls throughout, just different environment variables.

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
  (`/admin.html`), PDF report upload/download (stored as a database blob — works
  the same locally and on Vercel), and an auto-generated completion certificate
  with a real scannable QR code linking to a public verification page.
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
the database. If you ever need to do it manually:
```bash
node -e "require('./db').init().then(async () => { await require('./db').prepare('UPDATE users SET assessment_completed = 1 WHERE email = ?').run('client@example.com'); process.exit(0); })"
```

## Alternative: deploying to Render or Railway instead

This backend also runs as a normal persistent Node process (not just serverless),
so Render/Railway work too if you'd rather not use Vercel:

1. Push this folder to a GitHub repo.
2. Render → New → Web Service → connect the repo.
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add environment variables: `JWT_SECRET`, `NODE_ENV=production`, and optionally
   `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` (same Turso setup as above — recommended,
   since Render's free tier also wipes local files on redeploy). Without Turso
   configured, it'll fall back to a local SQLite file that persists between
   requests but not across redeploys.
6. Deploy. Render gives you a `https://your-app.onrender.com` URL.

One thing to know about Render's free tier specifically: it spins down after
~15 minutes of inactivity, so the first visit after a quiet period takes a few
extra seconds to wake back up. Vercel's cold starts are much faster, which is
why Turso + Vercel is the setup documented above.
