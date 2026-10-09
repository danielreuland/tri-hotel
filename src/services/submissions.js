// Meldeprozess: received -> verified -> auto_check -> admin_review -> live
// Nebenausgänge: expired, duplicate, rejected
const db = require('../db');
const config = require('../config');
const mailer = require('./mailer');
const rankings = require('./rankings');
const sites = require('./sites');
const { logAction } = require('../lib/audit');
const { newToken, sha256, ipHash, slugify, websiteKey } = require('../lib/util');

let enqueueFn = async () => {}; // wird von jobs/index.js gesetzt
function setEnqueue(fn) {
  enqueueFn = fn;
}
const enqueue = (name, data, opts) => enqueueFn(name, data, opts);

function entityUrl(ranking, entity, site) {
  const base = sites.urlFor(site);
  return ranking.is_default ? `${base}/${ranking.entity_type}/${entity.slug}` : `${base}/rankings/${ranking.slug}/${entity.slug}`;
}

async function appendLog(submissionId, step, ok, info) {
  await db.query(
    `UPDATE submissions SET pipeline_log = pipeline_log || $2::jsonb, updated_at = now() WHERE id = $1`,
    [submissionId, JSON.stringify([{ step, ok, info, at: new Date().toISOString() }])]
  );
}

async function setStatus(submissionId, status, extra = {}) {
  const cols = Object.keys(extra);
  const sets = cols.map((c, i) => `${c} = $${i + 3}`);
  await db.query(
    `UPDATE submissions SET status = $2, ${sets.length ? sets.join(', ') + ',' : ''} updated_at = now() WHERE id = $1`,
    [submissionId, status, ...cols.map((c) => extra[c])]
  );
}

// Neue Meldung. byAdmin = Admin legt selbst an (ohne Bestätigungsmail).
async function create(ranking, fields, { ip, adminId } = {}) {
  const byAdmin = Boolean(adminId);
  const tok = byAdmin ? null : newToken();
  const row = await db.one(
    `INSERT INTO submissions (ranking_id, entity_name, city, country, website, hints, notes,
        submitter_email, submitter_role, created_by_admin, verify_token_hash, token_expires_at,
        verified_at, status, ip_hash, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
        CASE WHEN $11::text IS NULL THEN NULL ELSE now() + make_interval(hours => $12) END,
        CASE WHEN $10 THEN now() END, $13, $14, $15)
     RETURNING *`,
    [
      ranking.id, fields.name, fields.city, fields.country, fields.website,
      JSON.stringify(fields.hints || {}), fields.notes || null,
      fields.email || null, fields.role || null, byAdmin, tok ? tok.hash : null, config.verifyTokenHours,
      byAdmin ? 'verified' : 'received', ip ? ipHash(ip) : null, adminId || null,
    ]
  );
  if (byAdmin) {
    await logAction(adminId, 'submission', row.id, 'create');
    await enqueue('auto-check', { submissionId: row.id });
  } else {
    const site = await sites.forRanking(ranking);
    await mailer.send({
      to: fields.email,
      template: 'verify',
      site,
      submissionId: row.id,
      data: { ranking, entityName: fields.name, link: `${sites.urlFor(site)}/bestaetigen/${tok.token}`, hours: config.verifyTokenHours },
    });
  }
  return row;
}

async function recentCountByIp(ip) {
  const r = await db.one(
    `SELECT count(*)::int AS n FROM submissions WHERE ip_hash = $1 AND created_at > now() - interval '1 day'`,
    [ipHash(ip)]
  );
  return r.n;
}

// Bestätigungslink. Ergebnis: { status: 'ok'|'expired'|'invalid'|'already', submission }
// Admin gibt eine unbestätigte Meldung selbst in die Auto-Prüfung (Melder-Adresse bleibt unbestätigt)
async function verifyByAdmin(submissionId, adminId) {
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [submissionId]);
  if (!sub) throw new Error('Meldung nicht gefunden.');
  if (!['received', 'expired'].includes(sub.status)) throw new Error('Nur für unbestätigte Meldungen möglich.');
  await setStatus(sub.id, 'verified', { verified_at: new Date(), verified_by: adminId });
  await logAction(adminId, 'submission', sub.id, 'verify_by_admin', { submitter_email_confirmed: false });
  await enqueue('auto-check', { submissionId: sub.id });
  return sub;
}

// Mails an den Melder nur, wenn er seine Adresse selbst über den Link bestätigt hat
function mayMailSubmitter(sub) {
  return Boolean(sub.submitter_email && sub.verified_at && !sub.verified_by);
}

async function verify(token) {
  const sub = await db.one('SELECT * FROM submissions WHERE verify_token_hash = $1', [sha256(token)]);
  if (!sub) return { status: 'invalid' };
  if (sub.status !== 'received') return { status: sub.status === 'expired' ? 'expired' : 'already', submission: sub };
  if (new Date(sub.token_expires_at) < new Date()) {
    await setStatus(sub.id, 'expired');
    return { status: 'expired', submission: sub };
  }
  await setStatus(sub.id, 'verified', { verified_at: new Date() });
  await enqueue('auto-check', { submissionId: sub.id });
  return { status: 'ok', submission: sub };
}

async function expireOld() {
  const r = await db.query(
    `UPDATE submissions SET status = 'expired', updated_at = now()
      WHERE status = 'received' AND token_expires_at < now()`
  );
  return r.rowCount;
}

// Gleiches Objekt = gleicher Objekttyp und gleiche Website-Domain oder gleicher Slug.
async function findDuplicate(ranking, sub) {
  const key = websiteKey(sub.website);
  return db.one(
    `SELECT e.*, er.status AS ranking_status
       FROM entities e LEFT JOIN entity_rankings er ON er.entity_id = e.id AND er.ranking_id = $4
      WHERE e.entity_type = $1
        AND (lower(regexp_replace(e.website, '^https?://(www\\.)?([^/:]+).*$', '\\2')) = $2 OR e.slug = $3)
      ORDER BY e.created_at LIMIT 1`,
    [ranking.entity_type, key, slugify(`${sub.entity_name} ${sub.city}`), ranking.id]
  );
}

async function uniqueSlug(entityType, base) {
  let slug = base || 'eintrag';
  for (let i = 2; await db.one('SELECT 1 FROM entities WHERE entity_type = $1 AND slug = $2', [entityType, slug]); i++) {
    slug = `${base}-${i}`;
  }
  return slug;
}

async function createEntity(ranking, sub) {
  const slug = await uniqueSlug(ranking.entity_type, slugify(`${sub.entity_name} ${sub.city}`));
  const entity = await db.one(
    `INSERT INTO entities (entity_type, slug, name, city, country, website) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [ranking.entity_type, slug, sub.entity_name, sub.city, sub.country, sub.website]
  );
  await db.query(`INSERT INTO entity_rankings (entity_id, ranking_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [entity.id, ranking.id]);
  return entity;
}

// ---------- Admin-Entscheidungen ----------

async function approve(submissionId, adminId) {
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [submissionId]);
  if (!sub || !sub.entity_id) throw new Error('Meldung ohne Objekt kann nicht freigegeben werden.');
  const ranking = await rankings.getRanking(sub.ranking_id);
  const result = await rankings.recomputeEntity(sub.entity_id, ranking.id);
  if (result.ko) throw new Error(`K.O.-Regel greift (${result.koReason}). Bitte ablehnen oder Wert korrigieren.`);

  await db.tx(async (c) => {
    await c.query(
      `UPDATE entity_rankings SET status = 'live', published_at = COALESCE(published_at, now()), updated_at = now()
        WHERE entity_id = $1 AND ranking_id = $2`,
      [sub.entity_id, ranking.id]
    );
    await c.query(`UPDATE submissions SET status = 'live', updated_at = now() WHERE id = $1`, [sub.id]);
    await logAction(adminId, 'submission', sub.id, 'approve', { score: result.score, completeness: result.completeness }, c);
  });

  const entity = await db.one('SELECT * FROM entities WHERE id = $1', [sub.entity_id]);
  if (mayMailSubmitter(sub)) {
    const site = await sites.forRanking(ranking);
    await mailer.send({
      to: sub.submitter_email,
      template: 'live',
      site,
      submissionId: sub.id,
      data: { ranking, entityName: entity.name, link: entityUrl(ranking, entity, site), score: result.score, provisional: result.provisional },
    });
  }
  return result;
}

async function reject(submissionId, adminId, reason) {
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [submissionId]);
  if (!sub) throw new Error('Meldung nicht gefunden.');
  await db.tx(async (c) => {
    await c.query(`UPDATE submissions SET status = 'rejected', rejection_reason = $2, updated_at = now() WHERE id = $1`, [sub.id, reason]);
    if (sub.entity_id) {
      await c.query(
        `UPDATE entity_rankings SET status = 'rejected', updated_at = now() WHERE entity_id = $1 AND ranking_id = $2 AND status <> 'live'`,
        [sub.entity_id, sub.ranking_id]
      );
    }
    await logAction(adminId, 'submission', sub.id, 'reject', { reason }, c);
  });
  if (mayMailSubmitter(sub)) {
    const ranking = await rankings.getRanking(sub.ranking_id);
    await mailer.send({
      to: sub.submitter_email, template: 'rejected', site: await sites.forRanking(ranking), submissionId: sub.id,
      data: { ranking, entityName: sub.entity_name, reason },
    });
  }
}

// Mögliche Dublette: Admin bestätigt „dasselbe Objekt“ (zusammenführen) …
async function confirmDuplicate(submissionId, adminId) {
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [submissionId]);
  const dupId = sub && (sub.possible_duplicate_of || sub.entity_id);
  if (!dupId) throw new Error('Keine mögliche Dublette hinterlegt.');
  const dup = await db.one(
    `SELECT e.*, er.status AS ranking_status FROM entities e
       LEFT JOIN entity_rankings er ON er.entity_id = e.id AND er.ranking_id = $2 WHERE e.id = $1`,
    [dupId, sub.ranking_id]
  );
  await setStatus(sub.id, 'duplicate', { entity_id: dup.id, possible_duplicate_of: null });
  await logAction(adminId, 'submission', sub.id, 'confirm_duplicate', { entity: dup.name });
  if (sub.submitter_email) {
    const ranking = await rankings.getRanking(sub.ranking_id);
    const site = await sites.forRanking(ranking);
    await mailer.send({
      to: sub.submitter_email, template: 'duplicate', site, submissionId: sub.id,
      data: { ranking, entityName: dup.name, link: dup.ranking_status === 'live' ? entityUrl(ranking, dup, site) : null },
    });
  }
}

// … oder „eigenes Objekt“: Dublettenprüfung überspringen und Auto-Prüfung fortsetzen
async function rejectDuplicate(submissionId, adminId) {
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [submissionId]);
  if (!sub) throw new Error('Meldung nicht gefunden.');
  await db.query(
    `UPDATE submissions SET status = 'verified', entity_id = NULL, possible_duplicate_of = NULL, duplicate_check_done = true, updated_at = now() WHERE id = $1`,
    [sub.id]
  );
  await appendLog(sub.id, 'Dublettenprüfung', true, 'Admin: eigenes Objekt – Prüfung wird fortgesetzt.');
  await logAction(adminId, 'submission', sub.id, 'not_a_duplicate');
  await enqueue('auto-check', { submissionId: sub.id });
}

async function hold(submissionId, adminId, note) {
  await db.query(`UPDATE submissions SET admin_note = $2, updated_at = now() WHERE id = $1`, [submissionId, note]);
  await logAction(adminId, 'submission', submissionId, 'hold', { note });
}

module.exports = {
  setEnqueue,
  enqueue,
  entityUrl,
  appendLog,
  setStatus,
  create,
  recentCountByIp,
  verify,
  verifyByAdmin,
  mayMailSubmitter,
  expireOld,
  findDuplicate,
  createEntity,
  approve,
  reject,
  hold,
  confirmDuplicate,
  rejectDuplicate,
};
