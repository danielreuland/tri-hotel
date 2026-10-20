// Geo-Vorschläge (OpenStreetMap, EU-Badegewässer, Höhendaten) für bestehende Objekte nachziehen – ohne Website/KI.
// Ergänzt nur fehlende Werte (Vertrauensstufe 4, Admin prüft) und erneuert die Kennzahlen (attributes.geo_info).
// Bestehende Werte werden nie überschrieben. Aufruf: npm run geo-refresh [-- --status=in_review,live]
require('dotenv').config();
const db = require('../src/db');
const rankings = require('../src/services/rankings');
const geo = require('../src/services/geo');
const { insertAutoFacts } = require('../src/jobs/auto-check');
const { logAction } = require('../src/lib/audit');

async function main() {
  const arg = process.argv.find((a) => a.startsWith('--status='));
  // Standard: nur Objekte in Prüfung – bei live-Objekten würden ungeprüfte Vorschläge sofort in den öffentlichen Score eingehen
  const statuses = arg ? arg.slice(9).split(',') : ['in_review'];
  const rows = await db.many(
    `SELECT e.*, er.ranking_id FROM entities e JOIN entity_rankings er ON er.entity_id = e.id
      WHERE er.status::text = ANY($1::text[]) AND e.lat IS NOT NULL ORDER BY e.name`, [statuses]);
  console.log(`${rows.length} Objekte`);
  let total = 0;
  for (const e of rows) {
    const criteria = (await rankings.getCriteria(e.ranking_id)).filter((c) => c.scoring && c.scoring.auto);
    const existing = new Set((await rankings.getFacts(e.id, e.ranking_id)).map((f) => f.criterion_id));
    const todo = criteria.filter((c) => !existing.has(c.id) || [].concat(c.scoring.auto).some((r) => r.info_only));
    try {
      const facts = await geo.suggestFacts({ lat: Number(e.lat), lng: Number(e.lng) }, todo);
      const n = await insertAutoFacts(e.id, facts.filter((f) => !existing.has(f.criterionId)));
      if (Object.keys(facts.infos || {}).length) {
        await db.query(`UPDATE entities SET attributes = attributes || jsonb_build_object('geo_info', $2::jsonb), updated_at = now() WHERE id = $1`,
          [e.id, JSON.stringify(facts.infos)]);
      }
      if (n) {
        await rankings.recomputeEntity(e.id, e.ranking_id);
        await logAction(null, 'entity', e.id, 'geo_refresh', { suggested: n });
      }
      total += n;
      console.log(`✓ ${e.name}: ${n} neue Vorschläge`);
    } catch (err) {
      console.log(`✗ ${e.name}: ${err.message}`);
    }
  }
  console.log(`Fertig: ${total} neue Vorschläge.`);
  await db.pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
