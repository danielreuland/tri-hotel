// Ampeln aller Camp-Anbieter aus den gespeicherten Prüfregeln neu bewerten (z. B. nach eingetragenem Kontakt) – ohne neue Prüfung.
// Aufruf: npm run camp-requalify
require('dotenv').config();
const db = require('../src/db');
const campCheck = require('../src/services/camp-check');

(async () => {
  for (const p of await db.many(`SELECT id, name, qualification FROM camp_providers ORDER BY name`)) {
    const q = await campCheck.requalify(p.id);
    if (q && q !== p.qualification) console.log(`${p.name}: ${p.qualification} → ${q}`);
  }
  await db.pool.end();
})().catch((err) => { console.error(err); process.exit(1); });
