// Camp-Anbieter aus einer Liste anlegen – wie „Anbieter anlegen“ im Admin (Name + Website, Entwurf, automatische Prüfung).
// Eingabe: JSON-Datei [{ name, website }]. Gleiche Domain wie ein vorhandener Anbieter → übersprungen.
// Aufruf: node scripts/create-camp-providers.js <datei.json> <admin-email> [--ohne-hotelmeldungen]
//   --ohne-hotelmeldungen: die Prüfung legt gefundene, unbekannte Hotels nicht als Meldungen an (camp_providers.hotel_submissions)
require('dotenv').config();
const fs = require('fs');
const PgBoss = require('pg-boss');
const config = require('../src/config');
const db = require('../src/db');
const campCheck = require('../src/services/camp-check');
const { logAction } = require('../src/lib/audit');
const { slugify, normalizeUrl, websiteKey } = require('../src/lib/util');

async function main() {
  const args = process.argv.slice(2);
  const [file, adminEmail] = args.filter((a) => !a.startsWith('--'));
  if (!file || !adminEmail) throw new Error('Aufruf: node scripts/create-camp-providers.js <datei.json> <admin-email> [--ohne-hotelmeldungen]');
  const hotelSubmissions = !args.includes('--ohne-hotelmeldungen');
  const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
  const admin = await db.one('SELECT id FROM admin_users WHERE lower(email) = lower($1)', [adminEmail]);
  if (!admin) throw new Error(`Admin ${adminEmail} nicht gefunden`);
  const site = await db.one('SELECT id FROM sites ORDER BY is_default DESC LIMIT 1');
  const boss = new PgBoss({ connectionString: config.databaseUrl });
  await boss.start();
  campCheck.setEnqueue((name, data, opts = {}) => boss.send(name, data, { retryLimit: 1, retryDelay: 60, ...opts }));
  const existing = await db.many('SELECT name, website FROM camp_providers WHERE site_id = $1', [site.id]);
  for (const r of rows) {
    const name = String(r.name || '').trim().slice(0, 120);
    const website = normalizeUrl(r.website);
    if (!name || !website) { console.log(`✗ übersprungen (Name/Website fehlt): ${name || '?'}`); continue; }
    const dup = existing.find((p) => websiteKey(p.website) === websiteKey(website));
    if (dup) { console.log(`✗ übersprungen: ${name} – Website gehört schon zu „${dup.name}“`); continue; }
    let slug = slugify(name);
    for (let i = 2; await db.one('SELECT 1 FROM camp_providers WHERE site_id = $1 AND slug = $2', [site.id, slug]); i++) slug = `${slugify(name)}-${i}`;
    const row = await db.one(
      `INSERT INTO camp_providers (site_id, slug, name, model, website, status, created_by, hotel_submissions)
       VALUES ($1, $2, $3, 'coach', $4, 'draft', $5, $6) RETURNING id`,
      [site.id, slug, name, website, admin.id, hotelSubmissions]);
    await logAction(admin.id, 'camp_provider', row.id, 'create_camp_provider', { name, website, hotel_submissions: hotelSubmissions, via: 'script' });
    await campCheck.queue(row.id);
    existing.push({ name, website });
    console.log(`✓ ${name} (${website}) – Prüfung eingereiht`);
  }
  await boss.stop({ graceful: true, wait: true });
  await db.pool.end();
}

main().catch((err) => { console.error(err.message); process.exit(1); });
