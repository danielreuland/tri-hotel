// Themenseiten einer Region (Tabelle area_topics, per Migration gepflegt), z. B. „Hotels mit 25-m-Becken auf Mallorca“.
// Auswahl über ein Kriterium des Rankings und dessen Ausprägungen (keine Annahmen über das Ranking im Code).
// Reihenfolge bleibt der Score (Neutralität); unter min_count Einträgen ist die Seite noindex und fehlt in der Sitemap.
const db = require('../db');
const rankings = require('./rankings');
const scoring = require('./scoring');

async function list(ranking, areaSlug) {
  return db.many(
    `SELECT * FROM area_topics WHERE ranking_id = $1 AND area_type = 'region' AND area_slug = $2 AND status = 'active' ORDER BY sort_order, slug`,
    [ranking.id, areaSlug]
  );
}

async function get(ranking, area, slug) {
  if (!area || area.type !== 'region' || !/^[a-z0-9-]+$/.test(slug)) return null;
  return db.one(
    `SELECT * FROM area_topics WHERE ranking_id = $1 AND area_type = 'region' AND area_slug = $2 AND slug = $3 AND status = 'active'`,
    [ranking.id, area.slug, slug]
  );
}

// Passt ein Faktwert zu den Ausprägungen der Themenseite? Mehrfachauswahl: mindestens eine passende Angabe
function matches(value, options) {
  const set = new Set(options || []);
  return scoring.selectedOptions(value).some((o) => set.has(o));
}

// Objekte der Region (schon nach Score sortiert), die zum Thema passen, mit der Bezeichnung ihres Werts
async function matching(ranking, topic, ranked) {
  if (!ranked.length) return [];
  const crit = (await rankings.getCriteria(ranking.id)).find((c) => c.code === topic.criterion_code);
  if (!crit) return [];
  const facts = await db.many(`SELECT entity_id, value FROM entity_facts WHERE criterion_id = $1 AND entity_id = ANY($2::uuid[])`,
    [crit.id, ranked.map((e) => e.id)]);
  const byEntity = new Map(facts.map((f) => [f.entity_id, f.value]));
  return ranked.filter((e) => matches(byEntity.get(e.id), topic.options))
    .map((e) => ({ ...e, topicValue: scoring.describeValue(crit, byEntity.get(e.id)) }));
}

// Für die Regionsseite: Themen mit Anzahl (verlinkt werden nur Themen mit Treffern)
async function forArea(ranking, area, d) {
  const topics = await list(ranking, area.slug);
  const out = [];
  for (const t of topics) {
    const n = (await matching(ranking, t, d.ranked)).length;
    if (n) out.push({ slug: t.slug, label: t.h1.replace(/\{anzahl\}/g, String(n)).replace(/\{score\}/g, ranking.score_name), count: n, indexable: n >= t.min_count });
  }
  return out;
}

module.exports = { list, get, matches, matching, forArea };
