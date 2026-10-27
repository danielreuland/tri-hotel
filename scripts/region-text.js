// KI-Entwürfe der Regionstexte erzeugen (Status „Entwurf“, öffentlich erst nach Freigabe im Admin).
// Aufruf: node scripts/region-text.js <slug> [<slug> …]   oder   node scripts/region-text.js --fehlende
// --fehlende: alle aktiven Regionen ohne Text. Bestehende Texte werden nur bei ausdrücklich genanntem Slug überschrieben,
// freigegebene nie.
require('dotenv').config();
const db = require('../src/db');
const llm = require('../src/lib/llm');
const regionText = require('../src/services/region-text');

async function main() {
  const args = process.argv.slice(2);
  const missing = args.includes('--fehlende');
  const slugs = args.filter((a) => !a.startsWith('--'));
  const list = await db.many(
    `SELECT r.* FROM regions r LEFT JOIN region_texts t ON t.region_id = r.id
      WHERE r.status = 'active' AND ($1 OR r.slug = ANY($2::text[])) AND ($1 = false OR t.region_id IS NULL OR t.body = '')
        AND COALESCE(t.status, 'draft') <> 'published'
      ORDER BY r.sort_order, r.name`, [missing, slugs]);
  for (const region of list) {
    const input = await regionText.gather(region);
    const out = await regionText.generate(input);
    if (out.usage) await llm.record({ purpose: 'region_text', model: out.usage.model, usage: out.usage.raw });
    if (!out.text) { console.log(`${region.name}: kein Text geliefert`); continue; }
    await db.query(
      `INSERT INTO region_texts (region_id, summary, body, generated_summary, generated_body, input_hash, model, generated_at, status, updated_at)
       VALUES ($1, $2, $3, $2, $3, $4, $5, now(), 'draft', now())
       ON CONFLICT (region_id) DO UPDATE SET summary = EXCLUDED.summary, body = EXCLUDED.body, generated_summary = EXCLUDED.summary,
         generated_body = EXCLUDED.body, input_hash = EXCLUDED.input_hash, model = EXCLUDED.model, generated_at = now(), status = 'draft', updated_at = now()`,
      [region.id, out.text.summary, out.text.body, regionText.inputHash(input), out.usage.model]);
    console.log(`${region.name}: Entwurf mit ${regionText.wordCount(out.text.body)} Wörtern (${out.usage.model})`);
  }
  console.log(`Fertig: ${list.length} Regionen.`);
}

main().then(() => db.pool.end()).catch((err) => { console.error(err.message); process.exit(1); });
