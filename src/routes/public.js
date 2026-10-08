const path = require('path');
const fs = require('fs');
const express = require('express');
const db = require('../db');
const config = require('../config');
const rankings = require('../services/rankings');
const scoring = require('../services/scoring');
const features = require('../services/features');
const featureLib = require('../lib/features');
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
  res.render('public/home', {
    title: ranking.name,
    description: content.hero_text || ranking.description,
    fullWidth: true,
    ranking,
    content,
    ranked,
    incomplete,
    month,
    topCard,
    search,
    searchActive: featureLib.isActive(search) || Boolean(month),
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

  const featureGroups = featureLib.groupFeatures(await features.forEntity(ranking.entity_type, entity.id));

  const images = await db.many(
    `SELECT * FROM entity_images WHERE entity_id = $1 AND approved_at IS NOT NULL
       AND (valid_until IS NULL OR valid_until >= current_date) ORDER BY is_primary DESC, sort_order`,
    [entity.id]
  );
  const formula = scoring.withDefaults(ranking.formula);

  res.render('public/entity', {
    title: `${entity.name} – ${ranking.score_name}`,
    description: `${ranking.score_name} für ${entity.name} (${entity.city}): geprüfte Fakten mit Quelle je Wert.`,
    canonical: `${res.locals.siteUrl}${entityPath(ranking, entity)}`,
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
    base: rankingBase(ranking),
  });
  return true;
}

async function renderMethod(req, res, ranking) {
  const [categories, criteria] = await Promise.all([rankings.getCategories(ranking.id), rankings.getCriteria(ranking.id)]);
  res.render('public/method', {
    title: `So funktioniert der ${ranking.score_name}`,
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

// Öffentliche Bilder: nur freigegeben und mit gültigen Rechten, keine Hotlinks
router.get('/media/:id', wrap(async (req, res, next) => {
  if (!/^[0-9a-f-]{36}$/.test(req.params.id)) return next();
  const img = await db.one(
    `SELECT storage_path FROM entity_images WHERE id = $1 AND approved_at IS NOT NULL AND (valid_until IS NULL OR valid_until >= current_date)`,
    [req.params.id]
  );
  if (!img) return next();
  const file = path.join(config.uploadDir, path.basename(img.storage_path));
  if (!fs.existsSync(file)) return next();
  res.sendFile(file);
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
