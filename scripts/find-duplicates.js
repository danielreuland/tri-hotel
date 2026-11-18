// Mögliche Dubletten auflisten (B-46): Name ähnlich, Koordinaten näher als 300 m oder gleiche Website-Adresse.
// Nur lesend – führt nichts zusammen. Zusammenführen bewusst per Migration (Vorbild: 080_zafiro_dubletten.sql).
//   node scripts/find-duplicates.js [--meter 300] [--aehnlich 0.6] [--typ hotel] [--alle]
// Ohne --alle nur Objekte, die in mindestens einem Ranking live, in Prüfung oder Entwurf sind.
const { pool } = require('../src/db');
const dup = require('../src/lib/duplicates');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

async function main() {
  const maxMeters = Number(arg('--meter', 300));
  const minSimilarity = Number(arg('--aehnlich', 0.6));
  const type = arg('--typ', null);
  const all = process.argv.includes('--alle');
  const { rows } = await pool.query(
    `SELECT e.id, e.entity_type, e.name, e.slug, e.city, e.country, e.lat, e.lng, e.website,
            string_agg(DISTINCT r.code || ':' || er.status, ', ') AS rankings
       FROM entities e
       LEFT JOIN entity_rankings er ON er.entity_id = e.id
       LEFT JOIN rankings r ON r.id = er.ranking_id
      WHERE ($1::text IS NULL OR e.entity_type = $1)
      GROUP BY e.id
     HAVING $2 OR bool_or(er.status IN ('live', 'in_review', 'draft'))
      ORDER BY e.name`, [type, all]);
  const pairs = dup.findPairs(rows, { maxMeters, minSimilarity });
  const show = (e) => `${e.name} (${e.entity_type}/${e.slug}; ${[e.city, e.country].filter(Boolean).join(', ')}; ${e.rankings || 'kein Ranking'})`;
  console.log(`${rows.length} Objekte geprüft, ${pairs.length} mögliche Dubletten (Schwellen: < ${maxMeters} m, Name ≥ ${minSimilarity}).\n`);
  for (const p of pairs) {
    console.log(`${p.strong ? '!!' : '  '} ${show(p.a)}\n   ~ ${show(p.b)}\n   ${p.reasons.join(' · ')}\n`);
  }
}

main().then(() => pool.end()).catch((err) => { console.error(err); pool.end(); process.exit(1); });
