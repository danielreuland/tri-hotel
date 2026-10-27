// Startseite aus Bereichen (Variante B „Kapitel“): Über die Site, Objekte des Rankings, Camp-Anbieter, Regionen.
// Reihenfolge, Sichtbarkeit und Hervorhebung je Bereich stehen in sites.home (Admin „Startseite“) – ohne Code-Änderung.
// Hervorhebung: automatisch und neutral (Platz 1, Region mit bester Eignung in der kommenden Jahreszeit, Camp im Tageswechsel)
// oder von der Redaktion gewählt (mit Enddatum). Partner- oder Werbestatus beeinflusst die Auswahl nie.
const db = require('../db');
const rankings = require('./rankings');
const scoring = require('./scoring');
const camps = require('./camps');
const regionGuide = require('./region-guide');

const BLOCKS = {
  about: { label: 'Kopfbereich: Kennzahlen und Grundsätze (immer oben)', picks: false, fixed: true },
  entities: { label: 'Objekte des Rankings (z. B. Hotels)', picks: true },
  camps: { label: 'Camp-Anbieter', picks: true },
  regions: { label: 'Trainingsregionen', picks: true },
};
const DEFAULT_ORDER = ['about', 'entities', 'camps', 'regions'];

// sites.home → vollständige, geordnete Liste aller Bereiche (unbekannte entfernt, fehlende angehängt)
function normalizeConfig(home) {
  const saved = Array.isArray((home || {}).blocks) ? home.blocks : [];
  const seen = new Set();
  const out = [];
  for (const b of saved) {
    if (!b || !BLOCKS[b.key] || seen.has(b.key)) continue;
    seen.add(b.key);
    out.push({ key: b.key, hidden: Boolean(b.hidden), pick: normalizePick(b.pick) });
  }
  for (const key of DEFAULT_ORDER) if (!seen.has(key)) out.push({ key, hidden: false, pick: { mode: 'auto' } });
  return out;
}

function normalizePick(p) {
  if (!p || p.mode !== 'editorial' || !p.slug) return { mode: 'auto' };
  const until = /^\d{4}-\d{2}-\d{2}$/.test(p.until || '') ? p.until : null;
  return { mode: 'editorial', slug: String(p.slug), until };
}

// Redaktionelle Wahl gilt bis einschließlich Enddatum
function editorialActive(pick, today = new Date()) {
  if (!pick || pick.mode !== 'editorial') return false;
  if (!pick.until) return true;
  return pick.until >= today.toISOString().slice(0, 10);
}

// Tageswechsel: jeder Anbieter kommt der Reihe nach dran (alphabetisch, unabhängig von Partnerschaften)
function rotationIndex(count, today = new Date()) {
  if (!count) return -1;
  const day = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000);
  return day % count;
}

// Kategorie-Balken für die Score-Karte (wie bisher im Hero)
function bars(categories, criteria, details) {
  return categories.map((cat) => {
    const crit = criteria.filter((c) => c.category_id === cat.id);
    const max = crit.reduce((s, c) => s + c.max_points, 0);
    const ids = new Set(crit.map((c) => c.id));
    const known = details.filter((d) => ids.has(d.criterionId) && d.known);
    return { label: cat.label, max, points: known.reduce((s, d) => s + d.points, 0) };
  }).filter((b) => b.max > 0);
}

async function entitiesBlock(ranking, pick) {
  const { ranked, incomplete } = await rankings.listLive(ranking, {});
  ranked.forEach((e, i) => { e.rank = i + 1; });
  let featured = null;
  let reason = 'top';
  if (editorialActive(pick)) {
    featured = ranked.find((e) => e.slug === pick.slug) || null;
    if (featured) reason = 'editorial';
  }
  if (!featured) featured = ranked[0] || null;
  let card = null;
  if (featured) {
    const [categories, criteria, facts, climate, opts] = await Promise.all([
      rankings.getCategories(ranking.id), rankings.getCriteria(ranking.id),
      rankings.getFacts(featured.id, ranking.id), rankings.getClimate(featured.id), rankings.scoreOptions(ranking),
    ]);
    const r = scoring.computeScore(criteria, rankings.factMap(facts), climate, opts);
    card = { entity: featured, score: r.score, label: r.label, provisional: r.provisional, bars: bars(categories, criteria, r.details) };
  }
  return {
    featured: card, reason,
    others: ranked.filter((e) => !featured || e.id !== featured.id).slice(0, 4),
    count: ranked.length + incomplete.length,
    rankedCount: ranked.length,
  };
}

async function campsBlock(siteId, pick) {
  const list = await camps.list(siteId, {});
  if (!list.length) return null;
  let featured = null;
  let reason = 'rotation';
  if (editorialActive(pick)) {
    featured = list.find((p) => p.slug === pick.slug) || null;
    if (featured) reason = 'editorial';
  }
  if (!featured) featured = list[rotationIndex(list.length)];
  return { featured, reason, others: list.filter((p) => p.id !== featured.id), count: list.length, MODELS: camps.MODELS };
}

// Regionen nach der Jahreszeit in zwei Monaten (Vorausplanung), z. B. Ende Oktober → Winter
async function regionsBlock(ranking, siteId, pick) {
  const seasonKey = regionGuide.seasonFor();
  const season = { key: seasonKey, ...regionGuide.SEASONS[seasonKey] };
  const rows = regionGuide.sortRegions(await regionGuide.load(ranking, siteId, {}), { month: season.months, formula: ranking.formula });
  if (!rows.length) return null;
  let featured = null;
  let reason = 'season';
  if (editorialActive(pick)) {
    featured = rows.find((r) => r.slug === pick.slug) || null;
    if (featured) reason = 'editorial';
  }
  if (!featured) featured = rows[0];
  const values = (key) => regionGuide.monthValue(featured.climate, key, season.months);
  const avg = { avg_high_c: values('avg_high_c'), rain_days: values('rain_days'), sunshine_h: values('sunshine_h'), sea_c: values('sea_c') };
  const fitMonths = season.months.filter((m) => featured.bestMonths.includes(m)).length;
  return { featured, reason, season, avg, fitMonths, others: rows.filter((r) => r.slug !== featured.slug), count: rows.length };
}

// Alle sichtbaren Bereiche mit Daten, in der eingestellten Reihenfolge. Bereiche ohne Inhalt entfallen.
async function load(site, ranking, { campGuide = false, regionGuide: hasRegions = false } = {}) {
  const config = normalizeConfig(site.home);
  const out = [];
  for (const b of config) {
    if (b.hidden) continue;
    let data = null;
    if (b.key === 'about') data = {};
    else if (b.key === 'entities') data = await entitiesBlock(ranking, b.pick);
    else if (b.key === 'camps' && campGuide) data = await campsBlock(site.id, b.pick);
    else if (b.key === 'regions' && hasRegions) data = await regionsBlock(ranking, site.id, b.pick);
    if (data) out.push({ key: b.key, ...data });
  }
  return out;
}

// Kennzahlen für den Bereich „Über die Seite“
async function stats(site, ranking) {
  const r = await db.one(
    `SELECT (SELECT count(*)::int FROM entity_rankings WHERE ranking_id = $2 AND status = 'live') AS entities,
            (SELECT count(*)::int FROM regions WHERE site_id = $1 AND status = 'active') AS regions,
            (SELECT count(*)::int FROM camp_providers WHERE site_id = $1 AND status = 'active') AS camps,
            (SELECT count(*)::int FROM criteria WHERE ranking_id = $2) AS criteria`, [site.id, ranking.id]);
  return r || { entities: 0, regions: 0, camps: 0, criteria: 0 };
}

async function saveConfig(siteId, blocks) {
  const clean = normalizeConfig({ blocks });
  await db.query('UPDATE sites SET home = $2, updated_at = now() WHERE id = $1', [siteId, JSON.stringify({ blocks: clean })]);
  return clean;
}

module.exports = { BLOCKS, DEFAULT_ORDER, normalizeConfig, normalizePick, editorialActive, rotationIndex, load, stats, saveConfig };
