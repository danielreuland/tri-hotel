// Redaktionstext je Region (Tabelle region_texts, per Migration gepflegt). Format wie die Hoteltexte:
// Absätze durch Leerzeile, Zwischenüberschriften mit "## ".
const db = require('../db');

async function published(regionId) {
  return db.one(`SELECT summary, body, compare_slug, compare_text, updated_at FROM region_texts WHERE region_id = $1 AND body <> ''`, [regionId]);
}

const wordCount = (body) => String(body || '').replace(/^## .*$/gm, '').split(/\s+/).filter(Boolean).length;

module.exports = { published, wordCount };
