// Creates an admin account. Run from the backend folder:
//   node scripts/create-admin.js "Alpha Internal" admin@alpha.example somepassword
//
// There is deliberately no public "become an admin" form — this is the only
// way to create one, so it stays something only someone with server/file
// (or Turso database) access can do.
//
// If you're using Turso in production, run this locally with
// TURSO_DATABASE_URL and TURSO_AUTH_TOKEN set in your environment so it
// creates the admin in the real remote database, not your local dev file.

const bcrypt = require('bcryptjs');
const db = require('../db');

async function main() {
  const [companyName, email, password] = process.argv.slice(2);

  if (!companyName || !email || !password) {
    console.error('Usage: node scripts/create-admin.js "<name>" <email> <password>');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  await db.init();

  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    await db.prepare(`UPDATE users SET role = 'admin' WHERE email = ?`).run(email.toLowerCase());
    console.log(`Existing account ${email} promoted to admin.`);
    process.exit(0);
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  await db
    .prepare(`INSERT INTO users (company_name, contact_name, email, password_hash, role) VALUES (?, ?, ?, ?, 'admin')`)
    .run(companyName, companyName, email.toLowerCase(), passwordHash);

  console.log(`Admin account created: ${email}`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
