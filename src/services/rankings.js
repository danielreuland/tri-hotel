// Laden von Rankings, Kriterien, Fakten und Klima sowie Neuberechnung der Scores.
const db = require('../db');
const scoring = require('./scoring');

async function getDefaultRanking(siteId) {
  return db.one(`SELECT * FROM rankings WHERE site_id = $1 AND is_default AND status = 'active'`, [siteId]);
}

async function getRankingBySlug(slug, siteId) {
  return db.one(`SELECT * FROM rankings WHERE slug = $1 AND site_id = $2 AND status = 'active'`, [slug, siteId]);
}

async function getRankingBySubdomain(sub, siteId) {
  return db.one(`SELECT * FROM rankings WHERE subdomain = $1 AND site_id = $2 AND status = 'active'`, [sub, siteId]);
}

async function getRanking(id) {
  return db.one(`SELECT * FROM rankings WHERE id = $1`, [id]);
}

async function getCategories(rankingId) {
  return db.many(`SELECT * FROM ranking_categories WHERE ranking_id = $1 ORDER BY sort_order`, [rankingId]);
}

async function getCriteria(rankingId, { includeInactive = false } = {}) {
  return db.many(
    `SELECT c.*, rc.label AS category_label, rc.sort_order AS category_sort
       FROM criteria c JOIN ranking_categories rc ON rc.id = c.category_id
      WHERE c.ranking_id = $1 ${includeInactive ? '' : 'AND c.active'}
      ORDER BY rc.sort_order, c.sort_order`,
    [rankingId]
  );
}

async function getFacts(entityId, rankingId) {
  return db.many(
    `SELECT f.* FROM entity_facts f JOIN criteria c ON c.id = f.criterion_id
      WHERE f.entity_id = $1 AND c.ranking_id = $2`,
    [entityId, rankingId]
  );
}

async function getClimate(entityId) {
  return db.many(`SELECT * FROM climate_monthly WHERE entity_id = $1 ORDER BY month`, [entityId]);
}

function factMap(facts) {
  const map = {};
  for (const f of facts) map[f.criterion_id] = f.value;
  return map;
}

// Durchschnittlicher Punkteanteil (0–1) je Kriterium über alle geprüften Objekte (Admin-Prüfung und live).
// Ersatzwert für unbekannte Kriterien bei formula.unknown_policy = 'average'. Kurz zwischengespeichert.
const sharesCache = new Map();
const SHARES_TTL_MS = 60 * 1000;

async function unknownShares(rankingId) {
  const hit = sharesCache.get(rankingId);
  if (hit && hit.at > Date.now() - SHARES_TTL_MS) return hit.shares;
  const criteria = await getCriteria(rankingId);
  const rows = await db.many(
    `SELECT f.criterion_id, f.value FROM entity_facts f
       JOIN entity_rankings er ON er.entity_id = f.entity_id AND er.ranking_id = $1 AND er.status IN ('in_review', 'live')`,
    [rankingId]
  );
  const shares = {};
  for (const c of criteria) {
    const max = Number(c.max_points) || 0;
    if (!max || c.scoring.type === 'climate') continue;
    const vals = rows.filter((r) => r.criterion_id === c.id).map((r) => scoring.pointsFor(c, r.value, null)).filter((p) => p.known);
    if (vals.length) shares[c.id] = vals.reduce((s, p) => s + p.points / max, 0) / vals.length;
  }
  sharesCache.set(rankingId, { at: Date.now(), shares });
  return shares;
}

function clearShares() {
  sharesCache.clear();
}

// Score-Optionen eines Rankings (Formel, Labels, Ersatzwerte) – für alle Stellen, die einen Score berechnen
async function scoreOptions(ranking, extra = {}) {
  return { formula: ranking.formula, labels: ranking.labels, unknownShares: await unknownShares(ranking.id), ...extra };
}

// Rechnet Score eines Objekts in einem Ranking neu und speichert ihn (inkl. Punkte je Fakt).
async function recomputeEntity(entityId, rankingId, client = db) {
  const ranking = await getRanking(rankingId);
  const criteria = await getCriteria(rankingId);
  const facts = await getFacts(entityId, rankingId);
  const climate = await getClimate(entityId);
  // Athleten-Score aus freigegebenen Bewertungen (fließt nur ein, wenn formula.athlete_enabled)
  const reviews = await client.query(
    `SELECT ratings, stay_month FROM reviews WHERE entity_id = $1 AND ranking_id = $2 AND status = 'published'`, [entityId, rankingId]);
  const athlete = scoring.athleteScore(reviews.rows, ranking.formula);
  const result = scoring.computeScore(criteria, factMap(facts), climate,
    await scoreOptions(ranking, { athleteScore: athlete.score, reviewCount: athlete.count }));

  for (const d of result.details) {
    const fact = facts.find((f) => f.criterion_id === d.criterionId);
    if (fact) await client.query('UPDATE entity_facts SET points = $1 WHERE id = $2', [d.points, fact.id]);
  }
  await client.query(
    `INSERT INTO entity_rankings (entity_id, ranking_id, fact_score, score, completeness, is_provisional, ko_reason,
       athlete_score, review_count, review_avg, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     ON CONFLICT (entity_id, ranking_id) DO UPDATE SET
       fact_score = EXCLUDED.fact_score, score = EXCLUDED.score, completeness = EXCLUDED.completeness,
       is_provisional = EXCLUDED.is_provisional, ko_reason = EXCLUDED.ko_reason, athlete_score = EXCLUDED.athlete_score,
       review_count = EXCLUDED.review_count, review_avg = EXCLUDED.review_avg, updated_at = now()`,
    [entityId, rankingId, result.factScore, result.score, result.completeness, result.provisional, result.koReason,
      athlete.score, reviews.rows.length, athlete.avgStars]
  );
  return result;
}

async function recomputeRanking(rankingId) {
  clearShares();
  const rows = await db.many('SELECT entity_id FROM entity_rankings WHERE ranking_id = $1', [rankingId]);
  for (const r of rows) await recomputeEntity(r.entity_id, rankingId);
  return rows.length;
}

// Live-Objekte eines Rankings mit fester Bewertung und „bester Reisezeit“ (nur Info).
// Mit Monat: nur Objekte, deren beste Reisezeit diesen Monat enthält – der Score ändert sich nicht.
// Ein Bild je Objekt für Listen: eigenes Objektbild (Hauptbild zuerst), sonst ein freigegebenes Gastfoto aus einer
// veröffentlichten Bewertung (nur wenn Bewertungen eingeschaltet sind). Beispielbilder der Region nicht – in einer
// Liste sähen sie wie ein Foto des Objekts aus. Ergebnis: Map(entityId -> { src, srcset, width, height, credit })
async function listThumbs(ranking, entityIds) {
  const out = new Map();
  if (!entityIds.length) return out;
  const variantSrc = (prefix, id, variants) => {
    const w = variants.includes(640) ? 640 : variants[0];
    return { src: `${prefix}/${id}-${w}.webp`, srcset: variants.filter((v) => v <= 1280).map((v) => `${prefix}/${id}-${v}.webp ${v}w`).join(', ') };
  };
  const own = await db.many(
    `SELECT DISTINCT ON (entity_id) entity_id, id, variants, width, height, credit FROM entity_images
      WHERE entity_id = ANY($1::uuid[]) AND approved_at IS NOT NULL AND (valid_until IS NULL OR valid_until >= current_date)
        AND cardinality(variants) > 0
      ORDER BY entity_id, is_primary DESC, sort_order, created_at`, [entityIds]);
  for (const i of own) {
    out.set(i.entity_id, { ...variantSrc('/media', i.id, i.variants), width: i.width, height: i.height,
      credit: `© ${String(i.credit || '').replace(/^\s*(©|\(c\))\s*/i, '')}` });
  }
  const missing = entityIds.filter((id) => !out.has(id));
  if (missing.length && require('./reviews').config(ranking).enabled) {
    const guest = await db.many(
      `SELECT DISTINCT ON (r.entity_id) r.entity_id, i.id, i.variants, i.width, i.height, r.author_name
         FROM review_images i JOIN reviews r ON r.id = i.review_id
        WHERE r.entity_id = ANY($1::uuid[]) AND r.ranking_id = $2 AND r.status = 'published' AND i.approved_at IS NOT NULL
          AND cardinality(i.variants) > 0
        ORDER BY r.entity_id, r.published_at DESC, i.sort_order`, [missing, ranking.id]);
    for (const i of guest) {
      out.set(i.entity_id, { ...variantSrc('/media/review', i.id, i.variants), width: i.width, height: i.height, credit: `Gastfoto: ${i.author_name}` });
    }
  }
  return out;
}

async function listLive(ranking, { month } = {}) {
  const rows = await db.many(
    `SELECT e.*, er.score, er.fact_score, er.completeness, er.is_provisional, er.ko_reason, er.published_at
       FROM entity_rankings er JOIN entities e ON e.id = er.entity_id
      WHERE er.ranking_id = $1 AND er.status = 'live'`,
    [ranking.id]
  );
  const formula = scoring.withDefaults(ranking.formula);
  const seo = require('../lib/seo');
  const climateRows = rows.length
    ? await db.many(`SELECT * FROM climate_monthly WHERE entity_id = ANY($1::uuid[])`, [rows.map((r) => r.id)])
    : [];
  const list = [];
  for (const row of rows) {
    const { score } = row;
    const completeness = Number(row.completeness);
    const best = seo.bestMonths(ranking.formula, climateRows.filter((c) => c.entity_id === row.id));
    if (month && !best.includes(month)) continue;
    const eligible = !row.ko_reason && score !== null && completeness >= formula.min_completeness;
    list.push({ ...row, score, completeness, eligible, bestMonths: best, label: scoring.labelFor(score, ranking.labels) });
  }
  // Vorschaubild je Objekt (wie auf der Objektseite: nur freigegeben und mit gültigen Rechten)
  const thumbs = await listThumbs(ranking, list.map((e) => e.id));
  for (const e of list) e.thumb = thumbs.get(e.id) || null;
  // Sortierung ausschließlich nach Score – Partner-Status spielt keine Rolle.
  list.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name, 'de'));
  return { ranked: list.filter((e) => e.eligible), incomplete: list.filter((e) => !e.eligible) };
}

module.exports = {
  unknownShares,
  clearShares,
  scoreOptions,
  getDefaultRanking,
  getRankingBySlug,
  getRankingBySubdomain,
  getRanking,
  getCategories,
  getCriteria,
  getFacts,
  getClimate,
  factMap,
  recomputeEntity,
  recomputeRanking,
  listLive,
};
