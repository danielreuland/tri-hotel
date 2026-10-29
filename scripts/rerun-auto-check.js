// Auto-Prüfung für bestehende Meldungen erneut starten – wie „Auto-Prüfung erneut“ im Admin (Status → verified,
// Eintrag im Audit-Log, Job einreihen). Für geparkte Importe in Etappen.
// Aufruf: node scripts/rerun-auto-check.js <admin-email> <meldungs-id> [<meldungs-id> …]
require('dotenv').config();
const PgBoss = require('pg-boss');
const config = require('../src/config');
const db = require('../src/db');
const submissions = require('../src/services/submissions');
const { logAction } = require('../src/lib/audit');

const ALLOWED = ['verified', 'auto_check', 'basics', 'admin_review'];

async function main() {
  const [adminEmail, ...ids] = process.argv.slice(2);
  if (!adminEmail || !ids.length) throw new Error('Aufruf: node scripts/rerun-auto-check.js <admin-email> <meldungs-id> …');
  const admin = await db.one('SELECT id FROM admin_users WHERE lower(email) = lower($1)', [adminEmail]);
  if (!admin) throw new Error(`Admin ${adminEmail} nicht gefunden`);
  const boss = new PgBoss({ connectionString: config.databaseUrl });
  await boss.start();
  submissions.setEnqueue((name, data, opts = {}) => boss.send(name, data, { retryLimit: 2, retryDelay: 60, ...opts }));
  let queued = 0;
  for (const id of ids) {
    const sub = await db.one('SELECT id, entity_name, status FROM submissions WHERE id = $1', [id]);
    if (!sub) { console.log(`✗ ${id}: nicht gefunden`); continue; }
    if (!ALLOWED.includes(sub.status)) { console.log(`✗ ${sub.entity_name}: Status ${sub.status}, übersprungen`); continue; }
    await submissions.setStatus(sub.id, 'verified');
    await logAction(admin.id, 'submission', sub.id, 'rerun_auto_check');
    await submissions.enqueue('auto-check', { submissionId: sub.id });
    queued++;
    console.log(`✓ ${sub.entity_name}`);
  }
  console.log(`Fertig: ${queued} Auto-Prüfungen eingereiht.`);
  await boss.stop({ graceful: true, wait: true });
  await db.pool.end();
}

main().catch((err) => { console.error(err.message); process.exit(1); });
