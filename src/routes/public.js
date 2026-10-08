const path = require('path');
const fs = require('fs');
const express = require('express');
const db = require('../db');
const config = require('../config');
const rankings = require('../services/rankings');
const scoring = require('../services/scoring');
const features = require('../services/features');
const featureLib = require('../lib/features');
const areas = require('../services/areas');
const seo = require('../lib/seo');
const media = require('../services/media');
const describer = require('../services/describer');
const { slugify } = require('../lib/util');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function parseMonth(q) {
  const m = Number(q);
  return Number.isInteger(m) && m >= 1 && m <= 12 ? m : null;
}

function rankingBase(ranking) {
  return ranking.is_default ? '' : `/rankings/${ranking.slug}`;
}

function entityPath(ranking, entity) {
  return ranking.is_default ? `/${ranking.entity_type}/${entity.slug}` : `/rankings/${ranking.slug}/${entity.slug}`;
}

// Punkte je Kategorie (für Gewichte und die Score-Karte im Hero)
function categoryBars(categories, criteria, details) {
  return categories
    .map((cat) => {
      const crit = criteria.filter((c) => c.category_id === cat.id);
      const max = crit.reduce((s, c) => s + c.max_points, 0);
      if (!details) return { label: cat.label, max };
      const ids = new Set(crit.map((c) => c.id));
      const known = details.filter((d) => ids.has(d.criterionId) && d.known);
      return {
        label: cat.label,
        max,
        points: known.reduce((s, d) => s + d.points, 0),
        knownMax: known.reduce((s, d) => s + d.max, 0),
      };
    })
    .filter((b) => b.max > 0);
}

async function renderList(req, res, ranking) {
  const month = parseMonth(req.query.monat);
  const [{ ranked: allRanked, incomplete: allIncomplete }, categories, criteria, catalog] = await Promise.all([
    rankings.listLive(ranking, { month }),
    rankings.getCategories(ranking.id),
    rankings.getCriteria(ranking.id),
    features.catalog(ranking.entity_type),
  ]);
  // Platz im Gesamtranking merken, bevor die Suche filtert
  allRanked.forEach((e, i) => { e.rank = i + 1; });

  // Suche: Text, Land, Mindest-Score, Leistungen (nur filterbare Katalog-Einträge)
  const all = [...allRanked, ...allIncomplete];
  const countries = [...new Set(all.map((e) => e.country).filter(Boolean))].sort();
  const filterFeatures = catalog.filter((f) => f.filterable);
  const search = featureLib.parseSearch(req.query, { countries, featureCodes: filterFeatures.map((f) => f.code) });
  const featureMap = await features.forEntities(ranking.entity_type, all.map((e) => e.id));
  const featureSets = new Map([...featureMap].map(([id, list]) => [id, new Set(list.map((f) => f.code))]));
  for (const e of all) e.features = (featureMap.get(e.id) || []).filter((f) => f.filterable).slice(0, 4);
  const ranked = featureLib.applySearch(allRanked, search, featureSets);
  const incomplete = featureLib.applySearch(allIncomplete, search, featureSets);

  // Score-Karte im Hero: bestplatziertes Objekt mit Punkten je Kategorie (unabhängig von der Suche)
  let topCard = null;
  if (allRanked.length) {
    const top = allRanked[0];
    const [facts, climate] = await Promise.all([rankings.getFacts(top.id, ranking.id), rankings.getClimate(top.id)]);
    const r = scoring.computeScore(criteria, rankings.factMap(facts), climate, { month, formula: ranking.formula, labels: ranking.labels });
    topCard = { entity: top, score: r.score, label: r.label, provisional: r.provisional, bars: categoryBars(categories, criteria, r.details) };
  }

  const content = ranking.content || {};
  const siteUrl = res.locals.siteUrl;
  const base = rankingBase(ranking);
  const searchActive = featureLib.isActive(search) || Boolean(month);
  const overview = await areas.overview(ranking, req.site.id);
  const homeTitle = content.hero_title ? `${ranking.name}: ${content.hero_title}` : ranking.name;
  res.render('public/home', {
    title: homeTitle,
    description: `${ranking.score_name} 0–100: ${allRanked.length} ${ranking.entity_label_pl} nach geprüften Fakten bewertet – ${(content.hero_text || ranking.description || '').split('. ')[0]}.`.slice(0, 160),
    canonical: `${siteUrl}${base || '/'}`,
    // Suchergebnis- und Filterseiten nicht indexieren (doppelte Inhalte)
    noindex: searchActive,
    jsonLd: [
      seo.websiteLd(req.site, siteUrl),
      seo.itemListLd(ranking.name, allRanked.slice(0, 20).map((e) => ({ name: e.name, url: `${siteUrl}${entityPath(ranking, e)}` }))),
    ],
    areaOverview: overview,
    fullWidth: true,
    ranking,
    content,
    ranked,
    incomplete,
    month,
    topCard,
    search,
    searchActive,
    countries,
    filterFeatures,
    totalCount: allRanked.length,
    weights: categoryBars(categories, criteria),
    totalPoints: criteria.reduce((s, c) => s + c.max_points, 0),
    criteriaCount: criteria.length,
    base: rankingBase(ranking),
    entityPath: (e) => entityPath(ranking, e),
    isHostRanking: req.hostRanking && req.hostRanking.id === ranking.id,
  });
}

// Anzeige der Vertrauensstufe (Konzept: Datenqualität)
function trustText(fact, ranking) {
  switch (fact.trust_level) {
    case 1: return `vom ${ranking.entity_label_sg} bestätigt`;
    case 2: return `geprüft am ${new Date(fact.checked_at).toLocaleDateString('de-DE')}`;
    case 3: return 'von Nutzern bestätigt';
    default: return 'automatisch ermittelt';
  }
}

async function renderEntity(req, res, ranking, slug) {
  const entity = await db.one(`SELECT * FROM entities WHERE entity_type = $1 AND slug = $2`, [ranking.entity_type, slug]);
  if (!entity) return null;
  const er = await db.one(`SELECT * FROM entity_rankings WHERE entity_id = $1 AND ranking_id = $2 AND status = 'live'`, [entity.id, ranking.id]);
  if (!er) return null;

  const month = parseMonth(req.query.monat);
  const [categories, criteria, facts, climate] = await Promise.all([
    rankings.getCategories(ranking.id),
    rankings.getCriteria(ranking.id),
    rankings.getFacts(entity.id, ranking.id),
    rankings.getClimate(entity.id),
  ]);
  const result = scoring.computeScore(criteria, rankings.factMap(facts), climate, { month, formula: ranking.formula, labels: ranking.labels });
  const climateRow = climate.find((c) => c.month === result.month) || null;
  const factByCrit = new Map(facts.map((f) => [f.criterion_id, f]));
  const detailByCrit = new Map(result.details.map((d) => [d.criterionId, d]));

  const groups = categories.map((cat) => {
    const items = criteria.filter((c) => c.category_id === cat.id).map((c) => {
      const fact = factByCrit.get(c.id);
      const d = detailByCrit.get(c.id);
      const isClimate = c.scoring.type === 'climate';
      return {
        label: c.label,
        value: scoring.describeValue(c, fact && fact.value, climateRow),
        points: d.known ? d.points : null,
        max: d.max,
        source: isClimate ? (climateRow ? 'Open-Meteo, Mittel der letzten 3 Jahre' : null) : fact ? trustText(fact, ranking) : null,
        evidenceUrl: fact && fact.evidence_url,
        disputed: fact && fact.disputed,
      };
    });
    const known = items.filter((i) => i.points !== null);
    return { label: cat.label, items, points: known.reduce((s, i) => s + i.points, 0), max: items.reduce((s, i) => s + i.max, 0) };
  });

  const entityFeatureList = await features.forEntity(ranking.entity_type, entity.id);
  const featureGroups = featureLib.groupFeatures(entityFeatureList);
  // Brotkrumen und „Weitere … in der Region“
  const siteUrl = res.locals.siteUrl;
  const base = rankingBase(ranking);
  const inRegions = await areas.regionsOf(req.site.id, entity);
  const region = inRegions[0] || null;
  const crumbs = [{ name: ranking.name, url: `${siteUrl}${base || '/'}` }];
  if (entity.country) crumbs.push({ name: seo.countryName(entity.country), url: `${siteUrl}${base}/land/${seo.countrySlug(entity.country)}` });
  if (region) crumbs.push({ name: region.name, url: `${siteUrl}${base}/region/${region.slug}` });
  crumbs.push({ name: entity.name, url: `${siteUrl}${entityPath(ranking, entity)}` });
  let nearby = [];
  if (region) {
    const { ranked } = await areas.liveWithRank(ranking, null);
    nearby = ranked.filter((e) => e.id !== entity.id && seo.inRegion(e, region)).slice(0, 4);
  }

  const images = await db.many(
    `SELECT * FROM entity_images WHERE entity_id = $1 AND approved_at IS NOT NULL
       AND (valid_until IS NULL OR valid_until >= current_date) ORDER BY is_primary DESC, sort_order`,
    [entity.id]
  );
  const formula = scoring.withDefaults(ranking.formula);
  // Redaktioneller Text (nur freigegeben); Kurzbeschreibung = Meta-Beschreibung
  const text = await db.one(`SELECT summary, body, published_at FROM entity_texts WHERE entity_id = $1 AND ranking_id = $2 AND status = 'published'`, [entity.id, ranking.id]);

  const canonical = `${siteUrl}${entityPath(ranking, entity)}`;
  const topFeatures = entityFeatureList.filter((f) => f.filterable).slice(0, 3).map((f) => f.label);
  const ogImage = `${siteUrl}/og/${ranking.entity_type}/${entity.slug}.png`;
  res.render('public/entity', {
    title: `${entity.name} (${entity.city || seo.countryName(entity.country)}) – ${ranking.score_name}${result.eligible ? ` ${result.score}` : ''}`,
    description: text && text.summary ? text.summary : (result.eligible
      ? `${ranking.score_name} ${result.score}/100 (${result.label}) für ${entity.name}${entity.city ? ` in ${entity.city}` : ''}. `
      : `${entity.name}${entity.city ? ` in ${entity.city}` : ''} im ${ranking.name}-Ranking. `)
      + (topFeatures.length ? `${topFeatures.join(', ')}. ` : '') + 'Geprüfte Fakten mit Quelle, Klima je Monat und Lage.',
    canonical,
    ogImage,
    ogType: 'article',
    jsonLd: [seo.entityLd({ entity, ranking, site: req.site, url: canonical, result, image: ogImage, description: text && text.summary }), seo.breadcrumbLd(crumbs)],
    crumbs,
    region,
    nearby,
    entityPath: (e) => entityPath(ranking, e),
    // Monatsansicht nicht indexieren (gleicher Inhalt mit anderem Score)
    noindex: Boolean(month),
    ranking,
    entity,
    result,
    eligible: result.eligible,
    minCompleteness: formula.min_completeness,
    groups,
    featureGroups,
    climate,
    month,
    images,
    textBlocks: text ? describer.parseBody(text.body) : [],
    textDate: text && text.published_at,
    base: rankingBase(ranking),
  });
  return true;
}

async function renderMethod(req, res, ranking) {
  const [categories, criteria] = await Promise.all([rankings.getCategories(ranking.id), rankings.getCriteria(ranking.id)]);
  res.render('public/method', {
    title: `So funktioniert der ${ranking.score_name}`,
    description: `Formel, Gewichte und alle ${criteria.length} Kriterien des ${ranking.score_name}: offen und für alle ${ranking.entity_label_pl} gleich. Partner und Werbung ändern den Score nicht.`,
    canonical: `${res.locals.siteUrl}${ranking.is_default && req.hostRanking && req.hostRanking.id === ranking.id ? res.locals.scorePath : `/rankings/${ranking.slug}/methodik`}`,
    ranking,
    formula: scoring.withDefaults(ranking.formula),
    categories: categories.map((cat) => ({ ...cat, criteria: criteria.filter((c) => c.category_id === cat.id) })),
    totalPoints: criteria.reduce((s, c) => s + c.max_points, 0),
    explainScoring,
  });
}

// Punkteschema in Worten für die öffentliche Methodik-Seite
function explainScoring(c) {
  const s = c.scoring;
  switch (s.type) {
    case 'option':
      return Object.entries(s.points)
        .filter(([k, p]) => p > 0 || (s.ko || []).includes(k))
        .map(([k, p]) => `${(s.labels && s.labels[k]) || k} = ${(s.ko || []).includes(k) && c.is_ko ? 'K.O.' : p}`)
        .join(' · ');
    case 'bool':
      return `ja = ${s.points_true}`;
    case 'rating':
      return `Einstufung ${s.min}–${s.max}`;
    case 'bands':
    case 'climate':
      return s.bands.map((b) => `${b.min ?? '…'}–${b.max ?? '…'} = ${b.points}`).join(' · ');
    default:
      return '';
  }
}

// ---------- Routen ----------

router.get('/', wrap(async (req, res, next) => {
  if (!req.hostRanking) return res.render('public/error', { title: 'Bald verfügbar', message: 'Hier entsteht gerade etwas.' });
  await renderList(req, res, req.hostRanking);
}));

router.get('/impressum', (req, res) => res.render('public/impressum', { title: 'Impressum' }));
router.get('/datenschutz', (req, res) => res.render('public/datenschutz', { title: 'Datenschutz' }));

// Öffentliche Objektbilder: nur freigegeben und mit gültigen Rechten, keine Hotlinks.
// /media/<uuid>-<breite>.webp (Varianten) oder /media/<uuid> (Altbestand im Original)
router.get('/media/:file', wrap(async (req, res, next) => {
  const parts = /^([0-9a-f-]{36})(?:-(\d{2,4})\.webp)?$/.exec(req.params.file);
  if (!parts) return next();
  const img = await db.one(
    `SELECT id, storage_path, variants FROM entity_images WHERE id = $1 AND approved_at IS NOT NULL AND (valid_until IS NULL OR valid_until >= current_date)`,
    [parts[1]]
  );
  if (!img) return next();
  let file;
  if (parts[2]) {
    if (!img.variants.includes(Number(parts[2]))) return next();
    file = media.entityFileFor(img.id, Number(parts[2]));
    // kurze Cache-Dauer: Freigaben können widerrufen werden oder ablaufen
    res.set('Cache-Control', 'public, max-age=86400');
  } else {
    file = path.join(config.uploadDir, path.basename(img.storage_path));
  }
  if (!fs.existsSync(file)) return next();
  res.sendFile(file);
}));

// Stimmungsbilder der Medienbibliothek (WebP-Varianten), z. B. /bild/<uuid>-1280.webp
router.get('/bild/:file', wrap(async (req, res, next) => {
  const parts = /^([0-9a-f-]{36})-(\d{2,4})\.webp$/.exec(req.params.file);
  if (!parts) return next();
  const m = await db.one('SELECT id, variants FROM site_media WHERE id = $1', [parts[1]]);
  const w = Number(parts[2]);
  if (!m || !m.variants.includes(w)) return next();
  const file = media.fileFor(m.id, w);
  if (!fs.existsSync(file)) return next();
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.type('webp').sendFile(file);
}));

router.get('/rankings/:rslug', wrap(async (req, res, next) => {
  const ranking = req.site && (await rankings.getRankingBySlug(req.params.rslug, req.site.id));
  if (!ranking) return next();
  await renderList(req, res, ranking);
}));

router.get('/rankings/:rslug/methodik', wrap(async (req, res, next) => {
  const ranking = req.site && (await rankings.getRankingBySlug(req.params.rslug, req.site.id));
  if (!ranking) return next();
  await renderMethod(req, res, ranking);
}));

router.get('/rankings/:rslug/:eslug', wrap(async (req, res, next) => {
  const ranking = req.site && (await rankings.getRankingBySlug(req.params.rslug, req.site.id));
  if (!ranking || !(await renderEntity(req, res, ranking, req.params.eslug))) return next();
}));

// ---------- Regionen und Länder (SEO-Landingpages) ----------

const MONTHS_DE = require('../lib/util').MONTHS;

async function renderArea(req, res, ranking, area) {
  const month = parseMonth(req.query.monat);
  const d = await areas.pageData(ranking, area, month);
  const siteUrl = res.locals.siteUrl;
  const base = rankingBase(ranking);
  const path = `${base}/${area.type === 'region' ? 'region' : 'land'}/${area.slug}`;
  const ov = await areas.overview(ranking, req.site.id);
  const best = seo.monthRanges(d.bestMonths, MONTHS_DE);
  const heading = `${ranking.name} ${area.nameIn}`;
  const crumbs = [{ name: ranking.name, url: `${siteUrl}${base || '/'}` }];
  if (area.type === 'region') crumbs.push({ name: seo.countryName(area.country), url: `${siteUrl}${base}/land/${seo.countrySlug(area.country)}` });
  crumbs.push({ name: area.name, url: `${siteUrl}${path}` });
  res.render('public/area', {
    title: `${heading} – Ranking nach ${ranking.score_name}`,
    description: (d.count
      ? `${d.count} geprüfte ${ranking.entity_label_pl} ${area.nameIn}, sortiert nach ${ranking.score_name}.`
      : `${ranking.entity_label_pl} ${area.nameIn}: Ranking nach ${ranking.score_name}.`)
      + (best ? ` Beste Reisemonate: ${best}.` : '') + ' Jeder Wert mit Quelle.',
    canonical: `${siteUrl}${path}`,
    ogImage: `${siteUrl}/og/${area.type === 'region' ? 'region' : 'land'}/${area.slug}.png`,
    // Seiten mit zu wenigen Einträgen und Monatsansichten nicht indexieren
    noindex: !d.indexable || Boolean(month),
    jsonLd: [
      seo.breadcrumbLd(crumbs),
      ...(d.ranked.length ? [seo.itemListLd(heading, d.ranked.map((e) => ({ name: e.name, url: `${siteUrl}${entityPath(ranking, e)}` })))] : []),
    ],
    heading, ranking, area, d, month, best, crumbs, base,
    otherRegions: ov.regions.filter((r) => !(area.type === 'region' && r.slug === area.slug)),
    countries: ov.countries.filter((c) => !(area.type === 'country' && c.slug === area.slug)),
    entityPath: (e) => entityPath(ranking, e),
    isHostRanking: req.hostRanking && req.hostRanking.id === ranking.id,
  });
}

async function findArea(siteId, kind, slug) {
  if (kind === 'region') {
    const r = await areas.region(siteId, slug);
    return r ? areas.regionArea(r) : null;
  }
  const code = seo.countryFromSlug(slug);
  return code ? areas.countryArea(code) : null;
}

router.get('/:kind(region|land)/:slug', wrap(async (req, res, next) => {
  const r = req.hostRanking;
  const area = r && (await findArea(req.site.id, req.params.kind, req.params.slug));
  if (!area) return next();
  await renderArea(req, res, r, area);
}));

router.get('/rankings/:rslug/:kind(region|land)/:slug', wrap(async (req, res, next) => {
  const ranking = req.site && (await rankings.getRankingBySlug(req.params.rslug, req.site.id));
  const area = ranking && (await findArea(req.site.id, req.params.kind, req.params.slug));
  if (!area) return next();
  await renderArea(req, res, ranking, area);
}));

// Methodik des Host-Rankings unter /<scorename>, z. B. /triscore
router.get('/:page', wrap(async (req, res, next) => {
  const r = req.hostRanking;
  if (!r || req.params.page !== slugify(r.score_name)) return next();
  await renderMethod(req, res, r);
}));

// Objektseite des Host-Rankings unter /<objekttyp>/<slug>, z. B. /hotel/seehotel-xy
router.get('/:type/:slug', wrap(async (req, res, next) => {
  const r = req.hostRanking;
  if (!r || req.params.type !== r.entity_type || !(await renderEntity(req, res, r, req.params.slug))) return next();
}));

module.exports = router;
