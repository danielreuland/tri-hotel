// Rankings je Objekt: ein vorhandenes Objekt (z. B. ein Triathlon-Hotel) für ein weiteres Ranking prüfen lassen oder
// aus einem Ranking nehmen. Die Prüfung ist eine eigene Admin-Meldung je Ranking – gleicher Ablauf wie jede Meldung
// (Auto-Prüfung nur für fehlende Kriterien, Prüfliste, Anfragen, Freigabe je Ranking). Geteilte Werte (share_key)
// sind schon da. Kandidaten je Ranking: rankings.candidate_rule (Werte aus anderen Rankings, die auf Eignung hindeuten).
const db = require('../db');
const { logAction } = require('../lib/audit');
const { valueMatches } = require('../lib/features');

// Meldungsstatus, in denen eine Prüfung noch läuft
const OPEN = ['received', 'verified', 'auto_check', 'basics', 'admin_review'];

// Kandidaten-Regel prüfen (rein). rule: {"min":n,"any":[{"ranking":"code","criterion":"code","values":[…],"label":"Text"}]}
// facts: [{ ranking_code, criterion_code, value }]. Ergebnis: { hits: [Bezeichnung], n, match }
function candidateHits(rule, facts) {
  const conds = (rule && Array.isArray(rule.any)) ? rule.any : [];
  const hits = [];
  for (const c of conds) {
    const f = (facts || []).find((x) => x.ranking_code === c.ranking && x.criterion_code === c.criterion);
    if (f && valueMatches(f.value, c.values)) hits.push(c.label || c.criterion);
  }
  const min = Math.max(1, Number(rule && rule.min) || 1);
  return { hits, n: hits.length, match: hits.length >= min };
}

// Kandidaten-Regel aus dem Admin prüfen (rein). Ergebnis: Fehlerliste
function validateCandidateRule(rule) {
  if (rule === null || rule === undefined) return [];
  if (typeof rule !== 'object' || Array.isArray(rule)) return ['Kandidaten-Regel ist kein JSON-Objekt.'];
  const errors = [];
  if (!Array.isArray(rule.any) || !rule.any.length) errors.push('Kandidaten-Regel braucht "any" mit mindestens einer Bedingung.');
  for (const [i, c] of (rule.any || []).entries()) {
    if (!c || typeof c.ranking !== 'string' || typeof c.criterion !== 'string' || !Array.isArray(c.values) || !c.values.length) {
      errors.push(`Kandidaten-Regel, Bedingung ${i + 1}: braucht "ranking", "criterion" und "values".`);
    }
  }
  if (rule.min !== undefined && !(Number.isInteger(rule.min) && rule.min >= 1)) errors.push('Kandidaten-Regel: "min" muss eine ganze Zahl ≥ 1 sein.');
  return errors;
}

// Alle Rankings der Site (Entwürfe eingeschlossen) mit dem Stand dieses Objekts und seiner neuesten Meldung
async function forEntity(entityId, siteId) {
  return db.many(
    `SELECT r.id, r.name, r.score_name, r.status AS ranking_status, r.entity_type,
            er.status, er.score, er.completeness,
            s.id AS sub_id, s.status AS sub_status
       FROM rankings r
       JOIN entities e ON e.id = $1 AND e.entity_type = r.entity_type
       LEFT JOIN entity_rankings er ON er.ranking_id = r.id AND er.entity_id = e.id
       LEFT JOIN LATERAL (SELECT id, status FROM submissions WHERE entity_id = e.id AND ranking_id = r.id ORDER BY created_at DESC LIMIT 1) s ON true
      WHERE r.site_id = $2 AND r.status <> 'archived'
      ORDER BY r.is_default DESC, r.name`, [entityId, siteId]);
}

// Stand je Objekt für Listen: Map(entityId -> [{ ranking, status, score }])
async function statusMap(entityIds) {
  const map = new Map();
  if (!entityIds.length) return map;
  const rows = await db.many(
    `SELECT er.entity_id, r.id AS ranking_id, r.name AS ranking, er.status, er.score
       FROM entity_rankings er JOIN rankings r ON r.id = er.ranking_id
      WHERE er.entity_id = ANY($1::uuid[]) ORDER BY r.is_default DESC, r.name`, [entityIds]);
  for (const r of rows) {
    if (!map.has(r.entity_id)) map.set(r.entity_id, []);
    map.get(r.entity_id).push(r);
  }
  return map;
}

// Objekt für ein Ranking prüfen lassen. Läuft schon eine Prüfung oder ist das Objekt dort live, wird nichts angelegt.
// Ergebnis: { submissionId, created }
async function startCheck(entityId, rankingId, adminId) {
  const entity = await db.one('SELECT * FROM entities WHERE id = $1', [entityId]);
  const ranking = await db.one('SELECT * FROM rankings WHERE id = $1', [rankingId]);
  if (!entity || !ranking) throw new Error('Objekt oder Ranking nicht gefunden.');
  if (ranking.status === 'archived') throw new Error(`„${ranking.name}“ ist archiviert.`);
  if (ranking.entity_type !== entity.entity_type) throw new Error(`„${ranking.name}“ bewertet keine Objekte dieses Typs.`);
  const er = await db.one('SELECT status FROM entity_rankings WHERE entity_id = $1 AND ranking_id = $2', [entityId, rankingId]);
  const latest = await db.one(
    'SELECT id, status FROM submissions WHERE entity_id = $1 AND ranking_id = $2 ORDER BY created_at DESC LIMIT 1', [entityId, rankingId]);
  if (latest && (OPEN.includes(latest.status) || (er && er.status === 'live'))) return { submissionId: latest.id, created: false };

  const sub = await db.tx(async (client) => {
    await client.query(
      `INSERT INTO entity_rankings (entity_id, ranking_id) VALUES ($1, $2)
       ON CONFLICT (entity_id, ranking_id) DO UPDATE SET status = 'draft', updated_at = now() WHERE entity_rankings.status = 'rejected'`,
      [entityId, rankingId]);
    const { rows: [row] } = await client.query(
      `INSERT INTO submissions (ranking_id, entity_id, entity_name, city, country, website, hints, notes,
          created_by_admin, verified_at, status, created_by, duplicate_check_done)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, now(), 'verified', $9, true) RETURNING id`,
      [rankingId, entityId, entity.name, entity.city, entity.country, entity.website,
        JSON.stringify({ added_to_ranking: true }), `Für „${ranking.name}“ geprüft (Objekt aus anderem Ranking).`, adminId || null]);
    await logAction(adminId, 'submission', row.id, 'add_to_ranking', { entity: entityId, ranking: ranking.code }, client);
    return row;
  });
  await require('./submissions').enqueue('auto-check', { submissionId: sub.id });
  return { submissionId: sub.id, created: true };
}

// Mehrere Objekte für ein Ranking prüfen lassen. Ergebnis: { created, existing, errors: [Text] }
async function startChecks(entityIds, rankingId, adminId) {
  const out = { created: 0, existing: 0, errors: [] };
  for (const id of entityIds) {
    try {
      const r = await startCheck(id, rankingId, adminId);
      if (r.created) out.created++;
      else out.existing++;
    } catch (err) {
      out.errors.push(err.message);
    }
  }
  return out;
}

// Objekt aus einem Ranking nehmen: dort nicht mehr gelistet (auch wenn es live war), laufende Prüfung beendet –
// ohne Mail. Werte und andere Rankings bleiben unberührt; erneut prüfen ist jederzeit möglich.
async function removeFromRanking(entityId, rankingId, adminId) {
  return db.tx(async (client) => {
    const { rows: [er] } = await client.query(
      'SELECT status AS old_status FROM entity_rankings WHERE entity_id = $1 AND ranking_id = $2 FOR UPDATE', [entityId, rankingId]);
    if (!er || er.old_status === 'rejected') throw new Error('Das Objekt steht nicht in diesem Ranking.');
    await client.query(
      `UPDATE entity_rankings SET status = 'rejected', updated_at = now() WHERE entity_id = $1 AND ranking_id = $2`, [entityId, rankingId]);
    const { rows: subs } = await client.query(
      `UPDATE submissions SET status = 'rejected', rejection_reason = 'Aus dem Ranking genommen (Admin)', updated_at = now()
        WHERE entity_id = $1 AND ranking_id = $2 AND status = ANY($3::submission_status[]) RETURNING id`, [entityId, rankingId, OPEN]);
    await logAction(adminId, 'entity', entityId, 'remove_from_ranking', { ranking: rankingId, was: er.old_status, submissions: subs.map((s) => s.id) }, client);
    return { wasLive: er.old_status === 'live', closed: subs.length };
  });
}

// Kandidaten für ein Ranking: Objekte gleichen Typs, die anderswo geprüft oder live sind und hier noch nicht laufen,
// mit Treffern der Kandidaten-Regel (meiste zuerst). onlyMatches: nur Objekte, die die Regel erfüllen.
async function candidates(ranking, { onlyMatches = true } = {}) {
  const rows = await db.many(
    `SELECT e.id, e.name, e.city, e.country,
            (SELECT string_agg(r2.name || ': ' || er2.status, ' · ' ORDER BY r2.name) FROM entity_rankings er2
               JOIN rankings r2 ON r2.id = er2.ranking_id WHERE er2.entity_id = e.id) AS elsewhere
       FROM entities e
      WHERE e.entity_type = $1
        AND EXISTS (SELECT 1 FROM entity_rankings x WHERE x.entity_id = e.id AND x.ranking_id <> $2 AND x.status IN ('in_review', 'live'))
        AND NOT EXISTS (SELECT 1 FROM entity_rankings y WHERE y.entity_id = e.id AND y.ranking_id = $2 AND y.status <> 'rejected')
      ORDER BY e.name`, [ranking.entity_type, ranking.id]);
  if (!rows.length) return [];
  const facts = await db.many(
    `SELECT f.entity_id, r.code AS ranking_code, c.code AS criterion_code, f.value
       FROM entity_facts f JOIN criteria c ON c.id = f.criterion_id JOIN rankings r ON r.id = c.ranking_id
      WHERE f.entity_id = ANY($1::uuid[])`, [rows.map((r) => r.id)]);
  const rule = ranking.candidate_rule;
  const out = rows.map((e) => ({ ...e, ...candidateHits(rule, facts.filter((f) => f.entity_id === e.id)) }));
  return out.filter((e) => !rule || !onlyMatches || e.match).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'de'));
}

module.exports = { OPEN, candidateHits, validateCandidateRule, forEntity, statusMap, startCheck, startChecks, removeFromRanking, candidates };
