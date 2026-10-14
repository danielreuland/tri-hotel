// Nutzerbewertungen: anlegen (mit Fotos), per E-Mail bestätigen, im Admin freigeben/ablehnen,
// Kennzahlen je Objekt und Faktencheck-Vorschläge (Vertrauensstufe 3) aus übereinstimmenden Antworten.
// Ob Bewertungen in den Score einfließen, entscheidet rankings.formula.athlete_enabled (siehe scoring.js).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const media = require('./media');
const mailer = require('./mailer');
const sites = require('./sites');
const rankings = require('./rankings');
const { answerOptions } = require('./inquiry-agent');
const { logAction } = require('../lib/audit');
const { newToken, sha256, isEmail, ipHash } = require('../lib/util');

const DIR = path.join(config.uploadDir, 'review-images');
const MAX_PHOTOS = 5;
const VERIFY_HOURS = 72;
const MIN_AGREEING = 2;          // so viele übereinstimmende Antworten ergeben einen Vorschlag
const CONSENT_VERSION = '2026-10-r1';
const PHOTO_CONSENT = 'Ich habe die Fotos selbst aufgenommen und erlaube die Veröffentlichung mit meinem Namen bei dieser Bewertung. Erkennbare Personen sind damit einverstanden.';

function config_(ranking) {
  const c = ranking.review_config || {};
  return { enabled: Boolean(c.enabled), dimensions: c.dimensions || [], questions: c.questions || [] };
}

// Faktencheck-Fragen: Kriterien des Rankings mit Antwortoptionen
async function questions(ranking) {
  const codes = config_(ranking).questions;
  if (!codes.length) return [];
  const criteria = await rankings.getCriteria(ranking.id);
  return codes.map((code) => criteria.find((c) => c.code === code)).filter(Boolean)
    .map((c) => ({ code: c.code, label: c.label, options: answerOptions(c) || [] })).filter((q) => q.options.length);
}

function stayMonth(raw, now = new Date()) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(raw || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  const max = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const min = new Date(Date.UTC(now.getUTCFullYear() - 3, now.getUTCMonth(), 1));
  return d <= max && d >= min ? d : null;
}

// Eingaben prüfen; Ergebnis { errors, data }
async function validate(ranking, body, files) {
  const cfg = config_(ranking);
  const errors = [];
  const name = String(body.author_name || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const email = String(body.email || '').trim().toLowerCase().slice(0, 200);
  const month = stayMonth(body.stay_month);
  const ratings = {};
  for (const d of cfg.dimensions) {
    const v = Number(body[`r_${d.code}`]);
    if (v >= 1 && v <= 5) ratings[d.code] = Math.round(v);
  }
  const qs = await questions(ranking);
  const answers = {};
  for (const q of qs) {
    const v = String(body[`q_${q.code}`] || '');
    if (q.options.some((o) => o.value === v)) answers[q.code] = v;
  }
  const text = String(body.body || '').trim().slice(0, 4000);
  const photos = (files || []).slice(0, MAX_PHOTOS + 1);
  if (name.length < 2) errors.push('Bitte gib einen Namen an (z. B. Vorname und erster Buchstabe des Nachnamens).');
  if (!isEmail(email)) errors.push('Bitte gib eine gültige E-Mail-Adresse an – wir schicken dir einen Bestätigungslink.');
  if (!month) errors.push('Bitte wähle den Monat deines Aufenthalts (höchstens drei Jahre zurück).');
  if (Object.keys(ratings).length < Math.min(3, cfg.dimensions.length)) errors.push('Bitte vergib mindestens drei Sterne-Bewertungen.');
  if (text.length < 40) errors.push('Bitte beschreib deine Erfahrung in ein paar Sätzen (mindestens 40 Zeichen).');
  if (body.honest !== 'on') errors.push('Bitte bestätige, dass du selbst dort warst und nicht für das Hotel arbeitest.');
  if (photos.length > MAX_PHOTOS) errors.push(`Höchstens ${MAX_PHOTOS} Fotos.`);
  if (photos.length && body.photo_consent !== 'on') errors.push('Bitte bestätige die Nutzungserlaubnis für deine Fotos.');
  const camp = /^[0-9a-f-]{36}$/.test(body.camp_provider_id || '') ? body.camp_provider_id : null;
  return {
    errors,
    data: { name, email, month, ratings, answers, title: String(body.title || '').trim().slice(0, 120) || null, text, camp, photos },
  };
}

// Neue Bewertung speichern, Fotos verarbeiten, Bestätigungsmail senden
async function create({ ranking, entity, site, data, ip }) {
  const tok = newToken();
  const id = crypto.randomUUID();
  // Fotos als WebP-Varianten speichern (eigene ID je Foto), Originale verwerfen
  const images = [];
  for (const f of data.photos) {
    const imgId = crypto.randomUUID();
    images.push({ id: imgId, ...(await media.processImage(f.path, DIR, imgId)) });
  }
  for (const f of data.photos) fs.unlink(f.path, () => {});
  await db.tx(async (c) => {
    await c.query(
      `INSERT INTO reviews (id, entity_id, ranking_id, author_name, email, verify_token_hash, token_expires_at, stay_month, camp_provider_id,
         ratings, answers, title, body, status, ip_hash, consent_version)
       VALUES ($1,$2,$3,$4,$5,$6, now() + make_interval(hours => $7), $8, $9, $10, $11, $12, $13, 'received', $14, $15)`,
      [id, entity.id, ranking.id, data.name, data.email, tok.hash, VERIFY_HOURS, data.month, data.camp, JSON.stringify(data.ratings),
        JSON.stringify(data.answers), data.title, data.text, ipHash(ip), CONSENT_VERSION]
    );
    let i = 0;
    for (const img of images) {
      await c.query(`INSERT INTO review_images (id, review_id, width, height, variants, sort_order) VALUES ($1,$2,$3,$4,$5,$6)`,
        [img.id, id, img.width, img.height, img.variants, i++]);
    }
  });
  await mailer.send({
    to: data.email, template: 'review-verify', site,
    data: { ranking, entityName: entity.name, name: data.name, hours: VERIFY_HOURS, link: `${sites.urlFor(site)}/bewertung-bestaetigen/${tok.token}` },
  });
  return id;
}

async function recentCountByIp(ip) {
  const { n } = await db.one(`SELECT count(*)::int AS n FROM reviews WHERE ip_hash = $1 AND created_at > now() - interval '1 day'`, [ipHash(ip)]);
  return n;
}

// Link aus der Mail: Bewertung wartet danach auf Freigabe
async function verify(token) {
  const r = await db.one('SELECT * FROM reviews WHERE verify_token_hash = $1', [sha256(token)]);
  if (!r) return { status: 'invalid' };
  if (r.status !== 'received') return { status: 'already', review: r };
  if (new Date(r.token_expires_at) < new Date()) return { status: 'expired', review: r };
  await db.query(`UPDATE reviews SET status = 'pending', verified_at = now(), verify_token_hash = NULL, updated_at = now() WHERE id = $1`, [r.id]);
  return { status: 'ok', review: r };
}

async function verifyByAdmin(id, adminId) {
  const r = await db.query(`UPDATE reviews SET status = 'pending', verified_by = $2, verify_token_hash = NULL, updated_at = now() WHERE id = $1 AND status = 'received'`, [id, adminId]);
  if (r.rowCount) await logAction(adminId, 'review', id, 'verify_review_by_admin');
}

async function publish(id, adminId) {
  const r = await db.one('SELECT * FROM reviews WHERE id = $1', [id]);
  if (!r || !['pending', 'received', 'rejected'].includes(r.status)) throw new Error('Diese Bewertung kann nicht freigegeben werden.');
  if (r.status === 'received' && !r.verified_by) throw new Error('Die E-Mail-Adresse ist noch nicht bestätigt – zuerst „Ohne Bestätigung prüfen“.');
  await db.query(`UPDATE reviews SET status = 'published', published_at = now(), published_by = $2, rejection_reason = NULL, updated_at = now() WHERE id = $1`, [id, adminId]);
  await logAction(adminId, 'review', id, 'publish_review');
  await afterChange(r.entity_id, r.ranking_id);
}

async function reject(id, adminId, reason) {
  const r = await db.one(`UPDATE reviews SET status = 'rejected', rejection_reason = $2, updated_at = now() WHERE id = $1 RETURNING *`, [id, String(reason || '').slice(0, 500) || null]);
  if (!r) return;
  await logAction(adminId, 'review', id, 'reject_review', { reason });
  await afterChange(r.entity_id, r.ranking_id);
}

async function remove(id, adminId) {
  const imgs = await db.many('SELECT * FROM review_images WHERE review_id = $1', [id]);
  const r = await db.one('DELETE FROM reviews WHERE id = $1 RETURNING *', [id]);
  if (!r) return;
  for (const i of imgs) for (const w of i.variants) fs.unlink(path.join(DIR, `${i.id}-${w}.webp`), () => {});
  await logAction(adminId, 'review', id, 'delete_review', { entity_id: r.entity_id });
  await afterChange(r.entity_id, r.ranking_id);
}

async function setImage(imageId, approve, adminId) {
  if (approve) {
    await db.query('UPDATE review_images SET approved_at = now(), approved_by = $2 WHERE id = $1', [imageId, adminId]);
  } else {
    const i = await db.one('DELETE FROM review_images WHERE id = $1 RETURNING *', [imageId]);
    if (i) for (const w of i.variants) fs.unlink(path.join(DIR, `${i.id}-${w}.webp`), () => {});
  }
  await logAction(adminId, 'review_image', imageId, approve ? 'approve_review_image' : 'delete_review_image');
}

async function reply(id, text, adminId) {
  const t = String(text || '').trim().slice(0, 2000) || null;
  await db.query('UPDATE reviews SET hotel_reply = $2, hotel_reply_at = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END, updated_at = now() WHERE id = $1', [id, t]);
  await logAction(adminId, 'review', id, 'reply_review');
}

// Nach jeder Änderung: Faktencheck-Vorschläge und Score (inkl. Kennzahlen) neu berechnen
async function afterChange(entityId, rankingId) {
  await factSuggestions(entityId, rankingId);
  await rankings.recomputeEntity(entityId, rankingId);
}

// Übereinstimmende Antworten aus freigegebenen Bewertungen -> Fakt der Stufe 3, nie über geprüfte Werte (Stufe 1/2)
async function factSuggestions(entityId, rankingId) {
  const ranking = await rankings.getRanking(rankingId);
  const qs = config_(ranking).questions;
  if (!qs.length) return 0;
  const criteria = await rankings.getCriteria(rankingId);
  const rows = await db.many(`SELECT answers FROM reviews WHERE entity_id = $1 AND ranking_id = $2 AND status = 'published'`, [entityId, rankingId]);
  let n = 0;
  for (const code of qs) {
    const c = criteria.find((x) => x.code === code);
    if (!c) continue;
    const counts = {};
    for (const r of rows) if (r.answers && r.answers[code]) counts[r.answers[code]] = (counts[r.answers[code]] || 0) + 1;
    const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!ranked.length || ranked[0][1] < MIN_AGREEING || (ranked[1] && ranked[1][1] === ranked[0][1])) continue;
    const [raw, count] = ranked[0];
    const value = c.scoring.type === 'bool' ? { bool: raw === 'true' } : { option: raw };
    const res = await db.query(
      `INSERT INTO entity_facts (entity_id, criterion_id, value, source, trust_level, evidence_text, checked_at)
       VALUES ($1, $2, $3, 'users', 3, $4, now())
       ON CONFLICT (entity_id, criterion_id) DO UPDATE SET value = EXCLUDED.value, source = 'users', trust_level = 3,
         evidence_text = EXCLUDED.evidence_text, evidence_url = NULL, checked_at = now()
       WHERE entity_facts.trust_level >= 3`,
      [entityId, c.id, JSON.stringify(value), `Von ${count} Gästen in ihren Bewertungen bestätigt.`]
    );
    n += res.rowCount;
  }
  return n;
}

// Freigegebene Bewertungen eines Objekts mit Fotos (für die öffentliche Seite)
async function published(entityId, rankingId) {
  const rows = await db.many(
    `SELECT r.*, p.name AS camp_name, p.slug AS camp_slug FROM reviews r LEFT JOIN camp_providers p ON p.id = r.camp_provider_id
      WHERE r.entity_id = $1 AND r.ranking_id = $2 AND r.status = 'published' ORDER BY r.stay_month DESC, r.published_at DESC`,
    [entityId, rankingId]
  );
  const imgs = rows.length
    ? await db.many(`SELECT * FROM review_images WHERE review_id = ANY($1::uuid[]) AND approved_at IS NOT NULL ORDER BY sort_order`, [rows.map((r) => r.id)])
    : [];
  for (const r of rows) r.images = imgs.filter((i) => i.review_id === r.id);
  return rows;
}

// Mittelwerte je Dimension (Anzeige)
function dimensionAverages(rows, dimensions) {
  return dimensions.map((d) => {
    const v = rows.map((r) => Number((r.ratings || {})[d.code])).filter((x) => x >= 1 && x <= 5);
    return { ...d, avg: v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null, n: v.length };
  });
}

function imageFile(id, width) {
  return path.join(DIR, `${id}-${width}.webp`);
}

module.exports = {
  MAX_PHOTOS, VERIFY_HOURS, CONSENT_VERSION, PHOTO_CONSENT, DIR,
  config: config_, questions, stayMonth, validate, create, recentCountByIp, verify, verifyByAdmin, publish, reject, remove,
  setImage, reply, afterChange, factSuggestions, published, dimensionAverages, imageFile,
};
