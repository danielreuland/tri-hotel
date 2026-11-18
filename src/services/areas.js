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
  return indexRules(ranking).region;
}

// Indexierung (B-46): Schwellen aus rankings.formula. Region ab region_min_entities Objekten mit Score und mit
// Einleitungstext (Redaktionstext oder Kurztext der Region), Land ab country_min_entities Objekten mit Score.
// Unvollständige Profile zählen nicht mit. Darunter bleibt die Seite erreichbar, aber noindex und ohne Sitemap-Eintrag.
function indexRules(ranking) {
  const f = (ranking && ranking.formula) || {};
  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
  const region = num(f.region_min_entities, 2);
  return { region, country: num(f.country_min_entities, 3) };
}

function areaIndexable(type, { scored, hasText }, ranking) {
  const rules = indexRules(ranking);
  return type === 'region' ? scored >= rules.region && Boolean(hasText) : scored >= rules.country;
}

// Was einer Bereichsseite zur Indexierung fehlt (Admin, Bericht)
function indexGaps(type, { scored, hasText }, ranking) {
  const rules = indexRules(ranking);
  const gaps = [];
  const min = type === 'region' ? rules.region : rules.country;
  if (scored < min) gaps.push(`${min - scored} ${min - scored === 1 ? 'Objekt' : 'Objekte'} mit Score`);
  if (type === 'region' && !hasText) gaps.push('Einleitungstext');
  return gaps;
}

// Regionen mit Einleitungstext (veröffentlichter Redaktionstext oder Kurztext der Region)
async function regionTextIds(siteId) {
  const rows = await db.many(
    `SELECT r.id FROM regions r WHERE r.site_id = $1 AND (COALESCE(btrim(r.intro), '') <> ''
        OR EXISTS (SELECT 1 FROM region_texts t WHERE t.region_id = r.id AND t.body <> ''))`, [siteId]);
  return new Set(rows.map((r) => r.id));
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
  const withText = await regionTextIds(siteId);
  const regionList = (await regions(siteId)).map((r) => {
    const members = all.filter((e) => seo.inRegion(e, r));
    const facts = { scored: ranked.filter((e) => seo.inRegion(e, r)).length, hasText: withText.has(r.id) };
    return { ...regionArea(r), count: members.length, scored: facts.scored, hasText: facts.hasText,
      indexable: areaIndexable('region', facts, ranking), gaps: indexGaps('region', facts, ranking), lastmod: seo.latest(members.map((e) => e.updated_at)) };
  });
  const codes = [...new Set(all.map((e) => e.country).filter(Boolean))].sort();
  const countryList = codes.map((c) => {
    const members = all.filter((e) => e.country === c);
    const facts = { scored: ranked.filter((e) => e.country === c).length };
    return { ...countryArea(c), count: members.length, scored: facts.scored,
      indexable: areaIndexable('country', facts, ranking), gaps: indexGaps('country', facts, ranking), lastmod: seo.latest(members.map((e) => e.updated_at)) };
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
    indexable: area.type === 'region'
      ? areaIndexable('region', { scored: inArea.length, hasText: (await regionTextIds(area.region.site_id)).has(area.region.id) }, ranking)
      : areaIndexable('country', { scored: inArea.length }, ranking),
    climate,
    bestMonths: seo.bestMonths(ranking.formula, climate),
    featureShares: seo.featureShares(all, featureMap),
    withFeature: (code) => all.filter((e) => (featureMap.get(e.id) || []).some((f) => f.code === code)),
    featureGroups: seo.featureGroupShares(all, featureMap),
    avgScore: scores.length ? Math.round(scores.reduce((s, x) => s + x, 0) / scores.length) : null,
    topScore: scores.length ? Math.max(...scores) : null,
    labelFor: (s) => scoring.labelFor(s, ranking.labels),
  };
}

// Regionen, in denen ein Objekt liegt (für Brotkrumen und „Weitere Hotels …“)
async function regionsOf(siteId, entity) {
  return (await regions(siteId)).filter((r) => seo.inRegion(entity, r));
}

// „Weitere Objekte“ auf der Objektseite (interne Links, B-46): zuerst die Region nach Score, aufgefüllt mit den nächstgelegenen
// Objekten im selben Land nach Entfernung – Partnerstatus spielt keine Rolle. Ohne Region nur das Land.
function nearbyEntities(entity, ranked, region, { limit = 4 } = {}) {
  const others = ranked.filter((e) => e.id !== entity.id);
  const inRegion = region ? others.filter((e) => seo.inRegion(e, region)).slice(0, limit) : [];
  const taken = new Set(inRegion.map((e) => e.id));
  const hasGeo = (e) => e.lat !== null && e.lat !== undefined && e.lng !== null && e.lng !== undefined;
  const fill = hasGeo(entity) && entity.country
    ? others.filter((e) => !taken.has(e.id) && e.country === entity.country && hasGeo(e))
      .map((e) => ({ ...e, distanceKm: seo.distanceKm({ lat: Number(entity.lat), lng: Number(entity.lng) }, { lat: Number(e.lat), lng: Number(e.lng) }) }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit - inRegion.length)
    : [];
  return { items: [...inRegion, ...fill], scope: region && !fill.length ? 'region' : (inRegion.length ? 'mixed' : 'country') };
}

module.exports = { nearbyEntities,  regions, region, regionArea, countryArea, minEntities, indexRules, areaIndexable, indexGaps, overview, pageData, regionsOf, liveWithRank };
