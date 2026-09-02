// Creates an admin account. Run from the backend folder:
//   node scripts/create-admin.js "Alpha Internal" admin@alpha.example somepassword
//
// There is deliberately no public "become an admin" form — this is the only
// way to create one, so it stays something only someone with server/file
// access can do.

const bcrypt = require('bcryptjs');
const db = require('../db');

const [companyName, email, password] = process.argv.slice(2);

if (!companyName || !email || !password) {
  console.error('Usage: node scripts/create-admin.js "<name>" <email> <password>');
  process.exit(1);
}
if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
if (existing) {
  db.prepare(`UPDATE users SET role = 'admin' WHERE email = ?`).run(email.toLowerCase());
  console.log(`Existing account ${email} promoted to admin.`);
  process.exit(0);
}

const passwordHash = bcrypt.hashSync(password, 10);
db.prepare(`INSERT INTO users (company_name, email, password_hash, role) VALUES (?, ?, ?, 'admin')`)
  .run(companyName, email.toLowerCase(), passwordHash);

console.log(`Admin account created: ${email}`);
