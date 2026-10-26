// Direktvergleich von 2–3 Objekten eines Rankings: Score, alle Kriterien je Kategorie, Leistungen,
// Partnerlinks und Camp-Anbieter. Bezeichnungen kommen aus dem Ranking, nichts ist objektspezifisch fest verdrahtet.
const db = require('../db');
const rankings = require('./rankings');
const scoring = require('./scoring');
const features = require('./features');
const partners = require('./partners');
const camps = require('./camps');
const seo = require('../lib/seo');
const { MONTHS } = require('../lib/util');

const SEP = '-vs-';
const MIN = 2;
const MAX = 3;

// "a-vs-b-vs-c" -> ['a','b','c'] (2–3 verschiedene, gültige Slugs) oder null
function parseCombo(combo) {
  const slugs = String(combo || '').split(SEP).filter(Boolean);
  if (slugs.length < MIN || slugs.length > MAX) return null;
  if (new Set(slugs).size !== slugs.length) return null;
  if (!slugs.every((s) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s))) return null;
  return slugs;
}

const comboPath = (slugs) => slugs.join(SEP);
// Kanonische Reihenfolge (alphabetisch), damit jede Kombination genau eine Adresse hat
const canonicalCombo = (slugs) => comboPath([...slugs].sort());

// Unterschied, wenn nicht alle Werte gleich sind (unbekannt zählt als eigener Wert)
const differs = (values) => new Set(values.map((v) => (v === null || v === undefined ? '\u0000' : String(v)))).size > 1;

// Höchste Punktzahl einer Zeile hervorheben – nur wenn es überhaupt Unterschiede gibt
function bestIndexes(points) {
  const known = points.filter((p) => p !== null && p !== undefined);
  if (known.length < 2 || !differs(known)) return [];
  const max = Math.max(...known);
  return points.map((p, i) => (p === max ? i : -1)).filter((i) => i >= 0);
}

async function load(ranking, slugs) {
  const entities = [];
  for (const slug of slugs) {
    const e = await db.one(
      `SELECT e.*, er.score, er.completeness, er.is_provisional, er.review_count, er.review_avg
         FROM entities e JOIN entity_rankings er ON er.entity_id = e.id AND er.ranking_id = $2 AND er.status = 'live'
        WHERE e.entity_type = $3 AND e.slug = $1`, [slug, ranking.id, ranking.entity_type]);
    if (!e) return null;
    entities.push(e);
  }
  const [categories, criteria] = await Promise.all([rankings.getCategories(ranking.id), rankings.getCriteria(ranking.id)]);
  const opts = await rankings.scoreOptions(ranking);
  const formula = scoring.withDefaults(ranking.formula);

  for (const e of entities) {
    const [facts, climate] = await Promise.all([rankings.getFacts(e.id, ranking.id), rankings.getClimate(e.id)]);
    e.result = scoring.computeScore(criteria, rankings.factMap(facts), climate, opts);
    e.factBy = new Map(facts.map((f) => [f.criterion_id, f]));
    e.detailBy = new Map(e.result.details.map((d) => [d.criterionId, d]));
    e.label = scoring.labelFor(e.score, ranking.labels);
    e.bestTime = seo.monthRanges(seo.bestMonths(formula, climate), MONTHS) || null;
    e.featureList = await features.forEntity(ranking.entity_type, e.id);
    e.partnerGroups = groupLinks(await partners.linksFor(e));
    e.campList = await camps.forEntity(e.id);
  }

  // Kriterien je Kategorie (Klima-Kriterien zählen nicht und werden nicht verglichen)
  const sections = categories.map((cat) => {
    const rows = criteria.filter((c) => c.category_id === cat.id && c.scoring.type !== 'climate').map((c) => {
      const cells = entities.map((e) => {
        const f = e.factBy.get(c.id);
        const d = e.detailBy.get(c.id);
        const known = Boolean(d && d.known);
        return { text: known ? scoring.describeValue(c, f && f.value) : null, points: known ? d.points : null, max: Number(c.max_points) };
      });
      return { label: c.label, max: Number(c.max_points), cells, differ: differs(cells.map((x) => x.text)), best: bestIndexes(cells.map((x) => x.points)) };
    });
    return { label: cat.label, rows };
  }).filter((s) => s.rows.length);
  // Punkte je Kategorie (Summe der bekannten Werte) für die Kopfzeile der Abschnitte
  for (const s of sections) {
    s.points = entities.map((e, i) => s.rows.reduce((sum, r) => sum + (r.cells[i].points || 0), 0));
    s.max = s.rows.reduce((sum, r) => sum + r.max, 0);
    s.best = bestIndexes(s.points);
  }

  // Leistungen: Vereinigung aller Leistungen, je Objekt vorhanden oder nicht
  const featureMap = new Map();
  for (const e of entities) for (const f of e.featureList) if (!featureMap.has(f.id)) featureMap.set(f.id, f);
  const featureRows = [...featureMap.values()]
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.label.localeCompare(b.label, 'de')) // Reihenfolge wie im Katalog
    .map((f) => {
      const has = entities.map((e) => e.featureList.some((x) => x.id === f.id));
      return { label: f.label, group: f.group_label || null, has, differ: differs(has) };
    });

  const overview = [
    { label: 'Ort', cells: entities.map((e) => [e.city, e.country ? seo.countryName(e.country) : null].filter(Boolean).join(', ') || null) },
    { label: 'Beste Reisezeit', cells: entities.map((e) => e.bestTime) },
    { label: 'Bewertungen', cells: entities.map((e) => (e.review_count ? `★ ${Number(e.review_avg).toFixed(1).replace('.', ',')} (${e.review_count})` : null)) },
    { label: 'Vollständigkeit', cells: entities.map((e) => (e.completeness === null ? null : `${Math.round(e.completeness)} %`)) },
  ].map((r) => ({ ...r, differ: differs(r.cells) }));

  return { entities, sections, featureRows, overview };
}

// Partnerlinks je Anbieter gruppieren (alphabetisch wie auf der Profilseite)
function groupLinks(links) {
  const groups = [];
  for (const l of links) {
    let g = groups.find((x) => x.code === l.code);
    if (!g) groups.push((g = { code: l.code, name: l.name, label_booking: l.label_booking, label_reviews: l.label_reviews, monetized: l.monetized, kinds: [] }));
    g.kinds.push(l.kind);
  }
  return groups;
}

module.exports = { SEP, MIN, MAX, parseCombo, comboPath, canonicalCombo, differs, bestIndexes, load };
