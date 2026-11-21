// Eigene Title/H1/Beschreibung je Regions- und Länderseite eines Rankings (Tabelle page_seo, Migration 125, Admin Regionen → „Title & H1“).
// Leere Felder = Muster aus rankings.content (area_title/area_h1 bzw. country_title/country_h1).
const db = require('../db');

const TYPES = ['region', 'land'];
const FIELDS = ['title', 'h1', 'description'];
const MAX = { title: 120, h1: 120, description: 300 };

async function get(rankingId, pageType, slug) {
  return db.one('SELECT title, h1, description FROM page_seo WHERE ranking_id = $1 AND page_type = $2 AND slug = $3', [rankingId, pageType, slug]);
}

async function list(rankingId) {
  return db.many('SELECT page_type, slug, title, h1, description, updated_at FROM page_seo WHERE ranking_id = $1', [rankingId]);
}

// Formularwerte bereinigen: leer → null, Länge begrenzen
function clean(input) {
  const out = {};
  for (const f of FIELDS) {
    const v = String((input || {})[f] || '').replace(/\s+/g, ' ').trim().slice(0, MAX[f]);
    out[f] = v || null;
  }
  return out;
}

// Speichern; alle Felder leer = Zeile löschen (Seite folgt wieder ganz dem Muster)
async function set(rankingId, pageType, slug, input) {
  if (!TYPES.includes(pageType) || !/^[a-z0-9-]+$/.test(slug)) throw new Error('Ungültige Seite');
  const v = clean(input);
  if (FIELDS.every((f) => v[f] === null)) {
    await db.query('DELETE FROM page_seo WHERE ranking_id = $1 AND page_type = $2 AND slug = $3', [rankingId, pageType, slug]);
    return null;
  }
  await db.query(
    `INSERT INTO page_seo (ranking_id, page_type, slug, title, h1, description) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (ranking_id, page_type, slug) DO UPDATE SET title = EXCLUDED.title, h1 = EXCLUDED.h1, description = EXCLUDED.description, updated_at = now()`,
    [rankingId, pageType, slug, v.title, v.h1, v.description]);
  return v;
}

// Title/H1 einer Bereichsseite: Override vor Muster; Länder nutzen country_*, sonst area_*; ohne Vorlage die bisherige Fassung
function areaTexts({ content, area, ranking, override, fill }) {
  const c = content || {};
  const isCountry = area.type === 'country';
  const h1Tpl = (isCountry && c.country_h1) || c.area_h1;
  const titleTpl = (isCountry && c.country_title) || c.area_title;
  const h1 = (override && override.h1) || (h1Tpl ? fill(h1Tpl) : `${ranking.name} ${area.nameIn}`);
  const title = (override && override.title) || (titleTpl ? fill(titleTpl) : `${h1} – Ranking nach ${ranking.score_name}`);
  return { h1, title, description: (override && override.description) || null };
}

module.exports = { get, list, set, clean, areaTexts, TYPES, FIELDS };
