// Redaktionstext je Region (Tabelle region_texts, per Migration gepflegt). Format wie die Hoteltexte:
// Absätze durch Leerzeile, Zwischenüberschriften mit "## ".
const db = require('../db');

async function published(regionId) {
  return db.one(`SELECT summary, body, updated_at FROM region_texts WHERE region_id = $1 AND body <> ''`, [regionId]);
}

// Vergleichstexte (Tabelle region_compare_texts, Migration 110). Ein Text gilt für das Paar beider Regionen.
// Vergleichsseiten werden nur mit Text indexiert, ohne bleiben sie noindex; kommt ein Text dazu, wird die Seite
// automatisch indexierbar (Entscheidung Daniel, 08.11.2026).
const pairKey = (a, b) => [a, b].sort().join(' ');

// Texte zu genau zwei Regionen (Slugs) für die Vergleichsseite
async function compareTexts(siteId, slugs) {
  if (!Array.isArray(slugs) || slugs.length !== 2) return [];
  return db.many(
    `SELECT r.slug, r.name, t.text, t.updated_at FROM region_compare_texts t JOIN regions r ON r.id = t.region_id
      WHERE r.site_id = $1 AND r.slug = ANY($2::text[]) AND t.compare_slug = ANY($2::text[]) AND t.compare_slug <> r.slug
      ORDER BY r.slug`, [siteId, slugs]);
}

// Vergleiche einer Region für ihre Seite: eigene Texte zuerst, dann Texte anderer Regionen über sie; je Paar einer.
// [{ slug, name, text }] mit slug/name der anderen Region
async function comparesFor(siteId, region) {
  const rows = await db.many(
    `SELECT o.slug, o.name, t.text, (t.region_id = $2) AS own, t.sort_order
       FROM region_compare_texts t JOIN regions r ON r.id = t.region_id
       JOIN regions o ON o.site_id = r.site_id AND o.slug = CASE WHEN t.region_id = $2 THEN t.compare_slug ELSE r.slug END
      WHERE r.site_id = $1 AND (t.region_id = $2 OR t.compare_slug = $3) AND o.id <> $2
      ORDER BY own DESC, t.sort_order, o.name`, [siteId, region.id, region.slug]);
  const seen = new Set();
  return rows.filter((r) => !seen.has(r.slug) && seen.add(r.slug)).map(({ slug, name, text }) => ({ slug, name, text }));
}

// Alle Regionspaare mit Text (für die Sitemap): [{ slugs: [a, b], lastmod }]
async function comparePairs(siteId) {
  const rows = await db.many(
    `SELECT r.slug, t.compare_slug, t.updated_at FROM region_compare_texts t
       JOIN regions r ON r.id = t.region_id
       JOIN regions o ON o.site_id = r.site_id AND o.slug = t.compare_slug AND o.id <> r.id
      WHERE r.site_id = $1`, [siteId]);
  const pairs = new Map();
  for (const row of rows) {
    const key = pairKey(row.slug, row.compare_slug);
    const prev = pairs.get(key);
    if (!prev || row.updated_at > prev.lastmod) pairs.set(key, { slugs: key.split(' '), lastmod: row.updated_at });
  }
  return [...pairs.values()].sort((a, b) => a.slugs.join().localeCompare(b.slugs.join()));
}

const wordCount = (body) => String(body || '').replace(/^## .*$/gm, '').split(/\s+/).filter(Boolean).length;

module.exports = { published, compareTexts, comparesFor, comparePairs, wordCount };
