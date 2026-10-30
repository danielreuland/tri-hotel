// Hotels aus einer vorbereiteten Liste als Admin-Meldungen anlegen (Standard-Ranking der Site) und die Auto-Prüfung einreihen.
// Eingabe: JSON-Datei [{ name, city, country (ISO-2), website?, note? }]. Dubletten erkennt die Auto-Prüfung (Admin entscheidet).
// Importierte Meldungen fragen Hunter.io nicht (hints.no_hunter), damit das Monatskontingent nicht sofort aufgebraucht ist.
// Aufruf: node scripts/import-hotels.js <datei.json> <admin-email> [quelle] [--ranking=<code>] [--ohne-pruefung]
//   --ranking: Ranking-Code (Standard: Standard-Ranking der Site); --ohne-pruefung: keine Auto-Prüfung einreihen (startet der Admin)
require('dotenv').config();
const fs = require('fs');
const PgBoss = require('pg-boss');
const config = require('../src/config');
const db = require('../src/db');
const submissions = require('../src/services/submissions');
const { normalizeUrl } = require('../src/lib/util');

async function main() {
  const args = process.argv.slice(2);
  const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v === undefined ? true : v]; }));
  const [file, adminEmail, source = 'import'] = args.filter((a) => !a.startsWith('--'));
  if (!file || !adminEmail) throw new Error('Aufruf: node scripts/import-hotels.js <datei.json> <admin-email> [quelle]');
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  const admin = await db.one('SELECT id FROM admin_users WHERE lower(email) = lower($1)', [adminEmail]);
  if (!admin) throw new Error(`Admin ${adminEmail} nicht gefunden`);
  const ranking = flags.ranking
    ? await db.one('SELECT * FROM rankings WHERE code = $1', [flags.ranking])
    : await db.one(`SELECT r.* FROM rankings r JOIN sites s ON s.id = r.site_id WHERE r.is_default AND r.status = 'active' ORDER BY s.is_default DESC LIMIT 1`);
  if (!ranking) throw new Error(`Ranking ${flags.ranking} nicht gefunden`);
  // Ohne Auto-Prüfung bleibt das Einreihen ein No-op (Standard in submissions.js), die Meldungen stehen auf „bestätigt“
  let boss = null;
  if (!flags['ohne-pruefung']) {
    boss = new PgBoss({ connectionString: config.databaseUrl });
    await boss.start();
    submissions.setEnqueue((name, data, opts = {}) => boss.send(name, data, { retryLimit: 2, retryDelay: 60, ...opts }));
  }
  let created = 0;
  for (const r of rows) {
    const name = String(r.name || '').trim();
    const country = String(r.country || '').trim().toUpperCase();
    if (!name || !/^[A-Z]{2}$/.test(country)) { console.log(`✗ übersprungen (Name/Land fehlt): ${name || '?'}`); continue; }
    await submissions.create(ranking, {
      name, city: String(r.city || '').trim(), country, website: r.website ? normalizeUrl(r.website) : null,
      hints: { no_hunter: true, import: source }, notes: r.note || `Import (${source})`,
    }, { adminId: admin.id });
    created++;
    console.log(`✓ ${name} (${country})`);
  }
  console.log(`Fertig: ${created} Meldungen im Ranking ${ranking.code} angelegt, ${boss ? 'Auto-Prüfungen eingereiht' : 'ohne Auto-Prüfung'}.`);
  if (boss) await boss.stop({ graceful: true, wait: true });
  await db.pool.end();
}

main().catch((err) => { console.error(err.message); process.exit(1); });
