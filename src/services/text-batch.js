// Beschreibungstexte: ein Entwurf je Objekt (Prüfansicht und Sammellauf nutzen denselben Ablauf) und der Sammellauf
// für Live-Objekte ohne Text (B-31 Punkt 4). Erzeugt werden nur Entwürfe – öffentlich wird ein Text erst nach Freigabe
// im Admin (einzeln oder gesammelt, dann nur Entwürfe ohne Prüfhinweis). Nichts hier ist Ranking-spezifisch.
const db = require('../db');
const describer = require('./describer');
const rankings = require('./rankings');
const { logAction } = require('../lib/audit');
const { inRegion } = require('../lib/seo');

let enqueue = async () => {};
function setEnqueue(fn) {
  enqueue = fn;
}

// Prüfhinweise, die eine Sammelfreigabe verhindern (Hinweise vom Typ „info“ sind nur Erinnerungen)
function warnings(checks) {
  return (Array.isArray(checks) ? checks : []).filter((c) => c && c.type !== 'info');
}

// Entwurf erzeugen und speichern (überschreibt einen vorhandenen Entwurf, Status wird „Entwurf“).
// Rückgabe: { checks, model } oder { error } (kein Text geliefert); Budget- und API-Fehler werden geworfen.
async function createDraft(entityId, rankingId, { adminId = null, submissionId = null, batch = false } = {}) {
  const input = await describer.gather(entityId, rankingId);
  const style = describer.styleOf(await rankings.getRanking(rankingId));
  const examples = await describer.styleExamples(rankingId, entityId);
  const out = await describer.generate(input, { examples, style });
  const llm = require('../lib/llm');
  for (const u of out.usages || []) {
    await llm.record({ purpose: u.purpose, model: u.model, usage: u.raw, entityId, submissionId });
  }
  if (!out.text) return { error: 'Das Modell hat keinen Text geliefert.' };
  await db.query(
    `INSERT INTO entity_texts (entity_id, ranking_id, summary, body, generated_summary, generated_body, input_hash, fact_refs, checks, model, generated_at, status, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $3, $4, $5, $6, $7, $8, now(), 'draft', $9, now())
     ON CONFLICT (entity_id, ranking_id) DO UPDATE SET summary = EXCLUDED.summary, body = EXCLUDED.body,
       generated_summary = EXCLUDED.summary, generated_body = EXCLUDED.body, input_hash = EXCLUDED.input_hash,
       fact_refs = EXCLUDED.fact_refs, checks = EXCLUDED.checks,
       model = EXCLUDED.model, generated_at = now(), status = 'draft', updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [entityId, rankingId, out.text.summary, out.text.body, describer.inputHash(input), JSON.stringify(out.refs), JSON.stringify(out.checks), out.model, adminId]
  );
  await logAction(adminId, 'entity', entityId, 'generate_text', {
    model: out.model, style_examples: examples.map((e) => e.name), custom_guide: style.custom, checks: out.checks.length,
    ...(batch ? { batch: true } : {}),
  });
  return { checks: out.checks, model: out.model };
}

// Reihenfolge der Kandidaten: nach Region (Reihenfolge aus dem Admin, Objekte ohne Region zuletzt), darin nach Score
function orderCandidates(rows, regions) {
  return rows
    .map((e) => {
      const idx = regions.findIndex((r) => inRegion(e, r));
      return { ...e, region: idx >= 0 ? regions[idx] : null, regionIndex: idx >= 0 ? idx : regions.length };
    })
    .sort((a, b) => a.regionIndex - b.regionIndex
      || (Number(b.score) || 0) - (Number(a.score) || 0)
      || String(a.name).localeCompare(String(b.name), 'de'));
}

// Live-Objekte des Rankings ohne Text (auch ohne Entwurf); offene Aufträge sind markiert
async function candidates(ranking) {
  const rows = await db.many(
    `SELECT e.id, e.name, e.slug, e.city, e.country, e.lat, e.lng, er.score,
            (SELECT s.id FROM submissions s WHERE s.entity_id = e.id ORDER BY s.created_at DESC LIMIT 1) AS sub_id,
            EXISTS (SELECT 1 FROM text_batch_items b WHERE b.entity_id = e.id AND b.ranking_id = er.ranking_id
                     AND b.status IN ('queued', 'running')) AS queued
       FROM entity_rankings er
       JOIN entities e ON e.id = er.entity_id
       LEFT JOIN entity_texts t ON t.entity_id = er.entity_id AND t.ranking_id = er.ranking_id
      WHERE er.ranking_id = $1 AND er.status = 'live' AND COALESCE(t.body, '') = ''`,
    [ranking.id]
  );
  const regions = ranking.site_id
    ? await db.many(`SELECT * FROM regions WHERE site_id = $1 AND status = 'active' ORDER BY sort_order, name`, [ranking.site_id])
    : [];
  return orderCandidates(rows, regions);
}

// Sammellauf starten: je ausgewähltem Kandidaten ein Auftrag und ein Job. Nicht (mehr) passende Objekte werden übergangen.
async function start(ranking, entityIds, adminId) {
  const wanted = new Set((entityIds || []).map(String));
  const list = (await candidates(ranking)).filter((c) => wanted.has(String(c.id)) && !c.queued);
  const items = [];
  for (const c of list) {
    const item = await db.one(
      `INSERT INTO text_batch_items (ranking_id, entity_id, requested_by) VALUES ($1, $2, $3)
       ON CONFLICT (entity_id, ranking_id) WHERE status IN ('queued', 'running') DO NOTHING RETURNING id`,
      [ranking.id, c.id, adminId]
    );
    if (item) items.push(item.id);
  }
  // Kein automatischer Neuversuch: jeder Aufruf kostet; Fehlgeschlagenes startet der Admin bei Bedarf neu
  for (const id of items) await enqueue('text-batch', { itemId: id }, { retryLimit: 0 });
  if (items.length) await logAction(adminId, 'ranking', ranking.id, 'text_batch.start', { count: items.length, entities: list.map((c) => c.id) });
  return items.length;
}

async function finish(id, status, message = null) {
  await db.query('UPDATE text_batch_items SET status = $2, message = $3, finished_at = now() WHERE id = $1', [id, status, message]);
}

// Ein Auftrag: vorher prüfen, ob das Objekt noch live ist und noch keinen Text hat – vorhandene Texte nie überschreiben
async function runItem(itemId) {
  const item = await db.one(
    `UPDATE text_batch_items SET status = 'running' WHERE id = $1 AND status = 'queued' RETURNING *`, [itemId]);
  if (!item) return null;
  try {
    const state = await db.one(
      `SELECT er.status, COALESCE(t.body, '') <> '' AS has_text,
              (SELECT s.id FROM submissions s WHERE s.entity_id = er.entity_id ORDER BY s.created_at DESC LIMIT 1) AS sub_id
         FROM entity_rankings er
         LEFT JOIN entity_texts t ON t.entity_id = er.entity_id AND t.ranking_id = er.ranking_id
        WHERE er.entity_id = $1 AND er.ranking_id = $2`,
      [item.entity_id, item.ranking_id]
    );
    if (!state || state.status !== 'live') return finish(item.id, 'skipped', 'nicht mehr live');
    if (state.has_text) return finish(item.id, 'skipped', 'hat inzwischen einen Text');
    const r = await createDraft(item.entity_id, item.ranking_id, { adminId: item.requested_by, submissionId: state.sub_id, batch: true });
    if (r.error) return finish(item.id, 'failed', r.error);
    const n = warnings(r.checks).length;
    return finish(item.id, 'done', n ? `${n} Prüfhinweis${n === 1 ? '' : 'e'}` : null);
  } catch (err) {
    console.error('[text-batch]', err.message);
    return finish(item.id, 'failed', String(err.message || err).slice(0, 300));
  }
}

// Stand je Objekt: der jüngste Auftrag und der Text (Entwurf mit/ohne Prüfhinweis), neueste zuerst
async function status(rankingId, { limit = 200 } = {}) {
  const rows = await db.many(
    `SELECT DISTINCT ON (b.entity_id) b.entity_id, b.status, b.message, b.requested_at, b.finished_at, e.name,
            t.status AS text_status, t.checks,
            (SELECT s.id FROM submissions s WHERE s.entity_id = e.id ORDER BY s.created_at DESC LIMIT 1) AS sub_id
       FROM text_batch_items b
       JOIN entities e ON e.id = b.entity_id
       LEFT JOIN entity_texts t ON t.entity_id = b.entity_id AND t.ranking_id = b.ranking_id
      WHERE b.ranking_id = $1
      ORDER BY b.entity_id, b.requested_at DESC, b.id DESC`,
    [rankingId]
  );
  return rows
    .map((r) => ({ ...r, warnings: warnings(r.checks).length }))
    .sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at) || String(a.name).localeCompare(String(b.name), 'de'))
    .slice(0, limit);
}

// Freigeben ohne Änderung am Text – wie „Freigeben“ in der Prüfansicht (Fingerabdrücke auf den aktuellen Stand, neu prüfen).
// requireClean: nur, wenn auch die erneute Prüfung keinen Hinweis findet. Rückgabe: true, wenn freigegeben.
async function publishUnchanged(entityId, rankingId, adminId, { requireClean = true } = {}) {
  const existing = await db.one('SELECT * FROM entity_texts WHERE entity_id = $1 AND ranking_id = $2', [entityId, rankingId]);
  if (!existing || existing.status !== 'draft' || !existing.summary || !existing.body) return false;
  if (requireClean && warnings(existing.checks).length) return false;
  const input = await describer.gather(entityId, rankingId);
  const style = describer.styleOf(await rankings.getRanking(rankingId));
  const checks = describer.recheck({ summary: existing.summary, body: existing.body }, input, style, existing.checks);
  if (requireClean && warnings(checks).length) {
    await db.query('UPDATE entity_texts SET checks = $3 WHERE entity_id = $1 AND ranking_id = $2', [entityId, rankingId, JSON.stringify(checks)]);
    return false;
  }
  const refs = existing.fact_refs ? describer.refFingerprints(input, Object.keys(existing.fact_refs)) : null;
  const done = await db.one(
    `UPDATE entity_texts SET status = 'published', input_hash = $3, fact_refs = $4, checks = $5,
            published_at = now(), published_by = $6, updated_by = $6, updated_at = now()
      WHERE entity_id = $1 AND ranking_id = $2 AND status = 'draft' RETURNING entity_id`,
    [entityId, rankingId, describer.inputHash(input), refs ? JSON.stringify(refs) : null, JSON.stringify(checks), adminId]
  );
  if (!done) return false;
  await logAction(adminId, 'entity', entityId, 'text_publish', { status: 'published', checks: checks.length, bulk: true });
  return true;
}

// Sammelfreigabe: nur Entwürfe ohne Prüfhinweis; Ergebnis { published, skipped }
async function publishClean(rankingId, entityIds, adminId) {
  let published = 0;
  let skipped = 0;
  for (const id of [...new Set((entityIds || []).map(String))]) {
    if (await publishUnchanged(id, rankingId, adminId)) published += 1;
    else skipped += 1;
  }
  return { published, skipped };
}

module.exports = { setEnqueue, createDraft, orderCandidates, candidates, start, runItem, status, publishClean, publishUnchanged, warnings };
