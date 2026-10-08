// Legt einen Admin an oder setzt sein Passwort neu.
// Aufruf: npm run create-admin -- admin@example.de            (Passwort wird abgefragt)
//         npm run create-admin -- admin@example.de --google   (nur Login mit Google, kein Passwort)
const readline = require('readline');
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db');

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email.includes('@')) {
    console.error('Aufruf: npm run create-admin -- <email>');
    process.exit(1);
  }
  if (process.argv.includes('--google')) {
    await pool.query(`INSERT INTO admin_users (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`, [email]);
    console.log(`Admin ${email} freigeschaltet – Anmeldung mit dem Google-Konto dieser Adresse.`);
    await pool.end();
    return;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const password = await new Promise((resolve) => rl.question('Passwort (min. 12 Zeichen): ', resolve));
  rl.close();
  if (password.length < 12) {
    console.error('Passwort zu kurz.');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO admin_users (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [email, hash]
  );
  console.log(`Admin ${email} gespeichert.`);
  await pool.end();
}

main();
