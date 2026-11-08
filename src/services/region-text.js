// Redaktionstext je Region (Tabelle region_texts, per Migration gepflegt). Format wie die Hoteltexte:
// Absätze durch Leerzeile, Zwischenüberschriften mit "## ".
const db = require('../db');

async function published(regionId) {
  return db.one(`SELECT summary, body, compare_slug, compare_text, updated_at FROM region_texts WHERE region_id = $1 AND body <> ''`, [regionId]);
}

// Vergleich zweier Regionen: indexiert wird er nur mit Redaktionstext (compare_slug/compare_text einer der beiden Regionen),
// ohne Text bleibt er noindex. Kommt ein Text dazu, wird die Seite automatisch indexierbar (Entscheidung Daniel, 08.11.2026).
async function compareTexts(siteId, slugs) {
  if (!Array.isArray(slugs) || slugs.length !== 2) return [];
  return db.many(
    `SELECT r.slug, r.name, t.compare_text AS text, t.updated_at FROM region_texts t JOIN regions r ON r.id = t.region_id
      WHERE r.site_id = $1 AND r.slug = ANY($2::text[]) AND t.compare_slug = ANY($2::text[]) AND t.compare_slug <> r.slug
        AND COALESCE(t.compare_text, '') <> '' AND t.body <> ''
      ORDER BY r.slug`, [siteId, slugs]);
}

// Alle Regionspaare mit Redaktionstext (für die Sitemap): [{ slugs: [a, b], lastmod }]
async function comparePairs(siteId) {
  const rows = await db.many(
    `SELECT r.slug, t.compare_slug, t.updated_at FROM region_texts t
       JOIN regions r ON r.id = t.region_id
       JOIN regions o ON o.site_id = r.site_id AND o.slug = t.compare_slug AND o.id <> r.id
      WHERE r.site_id = $1 AND COALESCE(t.compare_text, '') <> '' AND t.body <> ''`, [siteId]);
  const pairs = new Map();
  for (const row of rows) {
    const slugs = [row.slug, row.compare_slug].sort();
    const key = slugs.join(' ');
    const prev = pairs.get(key);
    if (!prev || row.updated_at > prev.lastmod) pairs.set(key, { slugs, lastmod: row.updated_at });
  }
  return [...pairs.values()].sort((a, b) => a.slugs.join().localeCompare(b.slugs.join()));
}

const wordCount = (body) => String(body || '').replace(/^## .*$/gm, '').split(/\s+/).filter(Boolean).length;

module.exports = { published, compareTexts, comparePairs, wordCount };
