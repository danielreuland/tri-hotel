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

// Rechnet Score eines Objekts in einem Ranking neu und speichert ihn (inkl. Punkte je Fakt).
async function recomputeEntity(entityId, rankingId, client = db) {
  const ranking = await getRanking(rankingId);
  const criteria = await getCriteria(rankingId);
  const facts = await getFacts(entityId, rankingId);
  const climate = await getClimate(entityId);
  const result = scoring.computeScore(criteria, factMap(facts), climate, {
    formula: ranking.formula,
    labels: ranking.labels,
  });

  for (const d of result.details) {
    const fact = facts.find((f) => f.criterion_id === d.criterionId);
    if (fact) await client.query('UPDATE entity_facts SET points = $1 WHERE id = $2', [d.points, fact.id]);
  }
  await client.query(
    `INSERT INTO entity_rankings (entity_id, ranking_id, fact_score, score, completeness, is_provisional, ko_reason, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (entity_id, ranking_id) DO UPDATE SET
       fact_score = EXCLUDED.fact_score, score = EXCLUDED.score, completeness = EXCLUDED.completeness,
       is_provisional = EXCLUDED.is_provisional, ko_reason = EXCLUDED.ko_reason, updated_at = now()`,
    [entityId, rankingId, result.factScore, result.score, result.completeness, result.provisional, result.koReason]
  );
  return result;
}

async function recomputeRanking(rankingId) {
  const rows = await db.many('SELECT entity_id FROM entity_rankings WHERE ranking_id = $1', [rankingId]);
  for (const r of rows) await recomputeEntity(r.entity_id, rankingId);
  return rows.length;
}

// Live-Objekte eines Rankings. Mit Monat wird der Score für diesen Monat neu berechnet.
async function listLive(ranking, { month } = {}) {
  const rows = await db.many(
    `SELECT e.*, er.score, er.fact_score, er.completeness, er.is_provisional, er.ko_reason, er.published_at
       FROM entity_rankings er JOIN entities e ON e.id = er.entity_id
      WHERE er.ranking_id = $1 AND er.status = 'live'`,
    [ranking.id]
  );
  const formula = scoring.withDefaults(ranking.formula);
  let criteria = null;
  const list = [];
  for (const row of rows) {
    let { score } = row;
    let completeness = Number(row.completeness);
    if (month) {
      criteria = criteria || (await getCriteria(ranking.id));
      const facts = await getFacts(row.id, ranking.id);
      const climate = await getClimate(row.id);
      const r = scoring.computeScore(criteria, factMap(facts), climate, { month, formula: ranking.formula, labels: ranking.labels });
      score = r.score;
      completeness = r.completeness;
    }
    const eligible = !row.ko_reason && score !== null && completeness >= formula.min_completeness;
    list.push({ ...row, score, completeness, eligible, label: scoring.labelFor(score, ranking.labels) });
  }
  // Sortierung ausschließlich nach Score – Partner-Status spielt keine Rolle.
  list.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name, 'de'));
  return { ranked: list.filter((e) => e.eligible), incomplete: list.filter((e) => !e.eligible) };
}

module.exports = {
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
