// Regionen und Länder als Landingpages: Daten je Seite (Top-Liste, Klima, Leistungen, Indexierung).
const db = require('../db');
const rankings = require('./rankings');
const features = require('./features');
const scoring = require('./scoring');
const seo = require('../lib/seo');

async function regions(siteId, { includeInactive = false } = {}) {
  return db.many(
    `SELECT * FROM regions WHERE site_id = $1 ${includeInactive ? '' : "AND status = 'active'"} ORDER BY sort_order, name`,
    [siteId]
  );
}

async function region(siteId, slug) {
  return db.one(`SELECT * FROM regions WHERE site_id = $1 AND slug = $2 AND status = 'active'`, [siteId, slug]);
}

// Bereich (Region oder Land) als einheitliches Objekt
function regionArea(r) {
  return { type: 'region', slug: r.slug, name: r.name, nameIn: r.name_in, intro: r.intro, country: r.country, match: (e) => seo.inRegion(e, r), region: r };
}

function countryArea(code) {
  return {
    type: 'country', slug: seo.countrySlug(code), name: seo.countryName(code), nameIn: seo.countryIn(code), intro: null, country: code,
    match: (e) => e.country === code,
  };
}

function minEntities(ranking) {
  const v = Number((ranking.formula || {}).region_min_entities);
  return Number.isFinite(v) && v > 0 ? v : 2;
}

// Alle Live-Objekte eines Rankings mit Platz im Gesamtranking
async function liveWithRank(ranking, month) {
  const { ranked, incomplete } = await rankings.listLive(ranking, { month });
  ranked.forEach((e, i) => { e.rank = i + 1; });
  return { ranked, incomplete };
}

// Übersicht für Startseite/Sitemap: welche Regionen und Länder haben wie viele Einträge?
async function overview(ranking, siteId) {
  const { ranked, incomplete } = await liveWithRank(ranking, null);
  const all = [...ranked, ...incomplete];
  const min = minEntities(ranking);
  const regionList = (await regions(siteId)).map((r) => {
    const n = all.filter((e) => seo.inRegion(e, r)).length;
    return { ...regionArea(r), count: n, indexable: n >= min };
  });
  const codes = [...new Set(all.map((e) => e.country).filter(Boolean))].sort();
  const countryList = codes.map((c) => {
    const n = all.filter((e) => e.country === c).length;
    return { ...countryArea(c), count: n, indexable: n >= min };
  });
  return { regions: regionList, countries: countryList };
}

// Daten für eine Bereichsseite
async function pageData(ranking, area, month) {
  const { ranked, incomplete } = await liveWithRank(ranking, month);
  const inArea = ranked.filter(area.match);
  const inAreaIncomplete = incomplete.filter(area.match);
  const all = [...inArea, ...inAreaIncomplete];
  const criteria = await rankings.getCriteria(ranking.id);

  const climateRows = all.length
    ? await db.many(`SELECT * FROM climate_monthly WHERE entity_id = ANY($1::uuid[])`, [all.map((e) => e.id)])
    : [];
  const climate = seo.averageClimate(climateRows);
  const featureMap = await features.forEntities(ranking.entity_type, all.map((e) => e.id));
  for (const e of all) e.features = (featureMap.get(e.id) || []).filter((f) => f.filterable).slice(0, 4);

  const scores = inArea.map((e) => e.score).filter((s) => s !== null);
  return {
    ranked: inArea,
    incomplete: inAreaIncomplete,
    count: all.length,
    indexable: all.length >= minEntities(ranking),
    climate,
    bestMonths: seo.bestMonths(criteria, climate),
    featureShares: seo.featureShares(all, featureMap),
    avgScore: scores.length ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length) : null,
    topScore: scores.length ? Math.max(...scores) : null,
    labelFor: (s) => scoring.labelFor(s, ranking.labels),
  };
}

// Regionen, in denen ein Objekt liegt (für Brotkrumen und „Weitere Hotels …“)
async function regionsOf(siteId, entity) {
  return (await regions(siteId)).filter((r) => seo.inRegion(entity, r));
}

module.exports = { regions, region, regionArea, countryArea, minEntities, overview, pageData, regionsOf, liveWithRank };
