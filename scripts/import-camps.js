// Importiert bzw. aktualisiert Camp-Anbieter aus db/seeds/camp-providers.json (Abgleich über den Slug).
// Hotels werden je Anbieter neu geschrieben; "entity" verknüpft ein Hotel aus dem Ranking (exakter Name).
// Offene Punkte werden als eigene Aufgaben auf dem Board angelegt (einmalig).
// Aufruf: npm run import-camps
const path = require('path');
const fs = require('fs');
const db = require('../src/db');

async function main() {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'db', 'seeds', 'camp-providers.json'), 'utf8'));
  const site = await db.one('SELECT id FROM sites WHERE code = $1', [data.site]);
  if (!site) throw new Error(`Site ${data.site} nicht gefunden`);
  let linked = 0;
  const unmatched = new Set();
  for (const p of data.providers) {
    const row = await db.one(
      `INSERT INTO camp_providers (site_id, slug, name, model, model_label, seat, summary, website, destinations, regions, features, prices, as_of, source_url, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (site_id, slug) DO UPDATE SET name = EXCLUDED.name, model = EXCLUDED.model, model_label = EXCLUDED.model_label,
         seat = EXCLUDED.seat, summary = EXCLUDED.summary, website = EXCLUDED.website, destinations = EXCLUDED.destinations,
         regions = EXCLUDED.regions, features = EXCLUDED.features, prices = EXCLUDED.prices, as_of = EXCLUDED.as_of,
         source_url = EXCLUDED.source_url, updated_at = now()
       RETURNING id`,
      [site.id, p.slug, p.name, p.model, p.model_label || null, p.seat || null, p.summary || null, p.website, p.destinations || [], p.regions || [],
        JSON.stringify(p.features || {}), JSON.stringify(p.prices || []), data.as_of, p.source_url || p.website, p.status || 'active']
    );
    await db.query('DELETE FROM camp_provider_hotels WHERE provider_id = $1', [row.id]);
    let i = 0;
    for (const h of p.hotels || []) {
      const e = h.entity ? await db.one('SELECT id FROM entities WHERE name = $1', [h.entity]) : null;
      if (h.entity && !e) unmatched.add(h.entity);
      if (e) linked++;
      await db.query(
        `INSERT INTO camp_provider_hotels (provider_id, entity_id, hotel_name, place, region, sort_order) VALUES ($1,$2,$3,$4,$5,$6)`,
        [row.id, e ? e.id : null, h.hotel_name, h.place || null, h.region || null, i++]
      );
    }
  }
  let tasks = 0;
  for (const t of data.open_points || []) {
    const exists = await db.one(`SELECT 1 FROM admin_tasks WHERE source = 'manual' AND title = $1`, [t]);
    if (exists) continue;
    const pos = (await db.one(`SELECT COALESCE(max(position), 0) + 1 AS p FROM admin_tasks WHERE status = 'open'`)).p;
    await db.query(`INSERT INTO admin_tasks (source, title, link, status, position) VALUES ('manual', $1, '/admin/camps', 'open', $2)`, [t, pos]);
    tasks++;
  }
  console.log(`${data.providers.length} Anbieter importiert, ${linked} Hotel-Verknüpfungen zum Ranking, ${tasks} Aufgaben angelegt.`);
  if (unmatched.size) console.log('Nicht gefunden (Name prüfen):', [...unmatched].join(', '));
  await db.pool.end();
}

main().catch(async (err) => {
  console.error(err.message);
  await db.pool.end().catch(() => {});
  process.exit(1);
});
