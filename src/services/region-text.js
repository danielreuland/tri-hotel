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

// Admin-Schalter je Paar (Migration 113): false = trotz Text nicht indexieren; null = Standard
async function pairSetting(siteId, slugs) {
  const row = await db.one('SELECT indexable FROM region_pair_settings WHERE site_id = $1 AND pair = $2', [siteId, [...slugs].sort().join('-vs-')]);
  return row ? row.indexable : null;
}

// Indexieren nur mit Text und ohne Abschaltung im Admin
const pairIndexable = (hasText, setting) => Boolean(hasText) && setting !== false;

// Alle Paare aktiver Regionen einer Site für den Admin: [{ pair, a, b, texts: [Regionsname], setting, indexable }]
async function pairOverview(siteId) {
  const regions = await db.many(`SELECT id, slug, name FROM regions WHERE site_id = $1 AND status = 'active' ORDER BY name`, [siteId]);
  const texts = await db.many(
    `SELECT r.slug, r.name, t.compare_slug FROM region_compare_texts t JOIN regions r ON r.id = t.region_id WHERE r.site_id = $1`, [siteId]);
  const settings = new Map((await db.many('SELECT pair, indexable FROM region_pair_settings WHERE site_id = $1', [siteId])).map((s) => [s.pair, s.indexable]));
  const out = [];
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      const [a, b] = [regions[i], regions[j]].sort((x, y) => x.slug.localeCompare(y.slug));
      const pair = `${a.slug}-vs-${b.slug}`;
      const by = texts.filter((t) => (t.slug === a.slug && t.compare_slug === b.slug) || (t.slug === b.slug && t.compare_slug === a.slug)).map((t) => t.name);
      const setting = settings.has(pair) ? settings.get(pair) : null;
      out.push({ pair, a, b, texts: by, setting, indexable: pairIndexable(by.length, setting) });
    }
  }
  return out.sort((x, y) => (y.texts.length > 0) - (x.texts.length > 0) || x.pair.localeCompare(y.pair));
}

async function setPairIndexable(siteId, pair, indexable) {
  await db.query(
    `INSERT INTO region_pair_settings (site_id, pair, indexable) VALUES ($1, $2, $3)
     ON CONFLICT (site_id, pair) DO UPDATE SET indexable = EXCLUDED.indexable, updated_at = now()`, [siteId, pair, indexable]);
}

// Alle indexierbaren Regionspaare (für die Sitemap): [{ slugs: [a, b], lastmod }]
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
  const off = new Set((await db.many('SELECT pair FROM region_pair_settings WHERE site_id = $1 AND NOT indexable', [siteId])).map((r) => r.pair));
  return [...pairs.values()].filter((p) => !off.has(p.slugs.join('-vs-'))).sort((a, b) => a.slugs.join().localeCompare(b.slugs.join()));
}

const wordCount = (body) => String(body || '').replace(/^## .*$/gm, '').split(/\s+/).filter(Boolean).length;

// Redaktionstext einer Länderseite (Tabelle country_texts, je Ranking): { summary, body, faq: [{ q, a }], updated_at } oder null
async function countryText(rankingId, country) {
  return db.one(`SELECT summary, body, faq, updated_at FROM country_texts WHERE ranking_id = $1 AND country = $2 AND body <> ''`,
    [rankingId, String(country || '').toUpperCase()]);
}

module.exports = { published, countryText, compareTexts, comparesFor, comparePairs, pairSetting, pairIndexable, pairOverview, setPairIndexable, wordCount };
