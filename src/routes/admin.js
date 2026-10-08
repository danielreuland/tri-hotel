// Adminbereich: Login, Warteschlange, Detailprüfung, Freigabe, Objekte anlegen, Bilder, Aufgaben, Log.
// Rankings verwalten: routes/admin-rankings.js
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const config = require('../config');
const rankings = require('../services/rankings');
const scoring = require('../services/scoring');
const submissions = require('../services/submissions');
const inquiries = require('../services/inquiries');
const featureService = require('../services/features');
const { requireAdmin } = require('../middleware/context');
const { logAction } = require('../lib/audit');
const { normalizeUrl } = require('../lib/util');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const STATUS_LABELS = {
  received: 'eingegangen', verified: 'bestätigt', auto_check: 'in Auto-Prüfung', admin_review: 'in Admin-Prüfung',
  live: 'live', rejected: 'abgelehnt', expired: 'verfallen', duplicate: 'Dublette',
};
const TRUST_LABELS = { 1: '1 – vom Betreiber bestätigt', 2: '2 – Admin geprüft', 3: '3 – Nutzer bestätigt', 4: '4 – automatisch' };
const TRUST_SOURCE = { 1: 'hotel', 2: 'admin', 3: 'users', 4: 'auto' };
const IMAGE_SOURCES = {
  owner_release: 'Schriftliche Freigabe des Betreibers', affiliate_feed: 'Partner-Feed', places_api: 'Places-API (mit Attribution)',
  user_upload: 'Nutzerfoto', own: 'Eigenes Foto', free_license: 'Freie Lizenz (nur generische Motive)',
};

router.use((req, res, next) => {
  res.locals.STATUS_LABELS = STATUS_LABELS;
  next();
});

// Ungültige IDs als 404 behandeln statt als Datenbankfehler
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
for (const p of ['id', 'entityId', 'answerId', 'inquiryId', 'consentId']) {
  router.param(p, (req, res, next, value) => (UUID_RE.test(value) ? next() : next('route')));
}

// ---------- Login ----------

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });

router.get('/login', (req, res) => res.render('admin/login', { title: 'Admin-Login', error: null, next: req.query.next || '/admin' }));

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = await db.one('SELECT * FROM admin_users WHERE email = $1', [email]);
  const ok = user && (await bcrypt.compare(String(req.body.password || ''), user.password_hash));
  const next = String(req.body.next || '/admin');
  if (!ok) return res.status(401).render('admin/login', { title: 'Admin-Login', error: 'E-Mail oder Passwort falsch.', next });
  req.session.regenerate((err) => {
    if (err) return res.status(500).render('admin/login', { title: 'Admin-Login', error: 'Anmeldung fehlgeschlagen.', next });
    req.session.admin = { id: user.id, email: user.email };
    // nur interne Admin-Pfade als Ziel zulassen (kein offener Redirect)
    res.redirect(/^\/admin(\/|$|\?)/.test(next) ? next : '/admin');
  });
}));

router.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/admin/login')));

router.use(requireAdmin);

// ---------- Warteschlange ----------

router.get('/', wrap(async (req, res) => {
  const status = STATUS_LABELS[req.query.status] ? req.query.status : req.query.status === 'alle' ? null : 'admin_review';
  const rankingId = UUID_RE.test(req.query.ranking || '') ? req.query.ranking : null;
  const rows = await db.many(
    `SELECT s.*, r.name AS ranking_name, r.score_name, er.score, er.completeness, er.ko_reason, e.slug
       FROM submissions s JOIN rankings r ON r.id = s.ranking_id
       LEFT JOIN entity_rankings er ON er.entity_id = s.entity_id AND er.ranking_id = s.ranking_id
       LEFT JOIN entities e ON e.id = s.entity_id
      WHERE ($1::submission_status IS NULL OR s.status = $1) AND ($2::uuid IS NULL OR s.ranking_id = $2)
      ORDER BY s.created_at DESC LIMIT 300`,
    [status, rankingId]
  );
  const counts = await db.many(`SELECT status, count(*)::int AS n FROM submissions GROUP BY status`);
  const allRankings = await db.many(`SELECT id, name FROM rankings ORDER BY name`);
  res.render('admin/queue', { title: 'Warteschlange', rows, status, rankingId, counts, allRankings });
}));

// ---------- Detailansicht ----------

async function loadDetail(id) {
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [id]);
  if (!sub) return null;
  const ranking = await rankings.getRanking(sub.ranking_id);
  const [categories, criteria] = await Promise.all([rankings.getCategories(ranking.id), rankings.getCriteria(ranking.id)]);
  let entity = null;
  let er = null;
  let facts = [];
  let climate = [];
  let images = [];
  if (sub.entity_id) {
    entity = await db.one('SELECT * FROM entities WHERE id = $1', [sub.entity_id]);
    er = await db.one('SELECT * FROM entity_rankings WHERE entity_id = $1 AND ranking_id = $2', [entity.id, ranking.id]);
    facts = await rankings.getFacts(entity.id, ranking.id);
    climate = await rankings.getClimate(entity.id);
    images = await db.many('SELECT * FROM entity_images WHERE entity_id = $1 ORDER BY sort_order, created_at', [entity.id]);
  }
  const result = scoring.computeScore(criteria, rankings.factMap(facts), climate, { formula: ranking.formula, labels: ranking.labels });
  const emails = await db.many('SELECT * FROM email_log WHERE submission_id = $1 ORDER BY created_at', [sub.id]);
  // Anfragen an den Betreiber mit Antworten
  let inquiryList = [];
  let unclear = [];
  if (entity) {
    inquiryList = await db.many(
      `SELECT * FROM inquiries WHERE entity_id = $1 AND ranking_id = $2 ORDER BY created_at DESC`, [entity.id, ranking.id]
    );
    const answers = inquiryList.length
      ? await db.many(`SELECT * FROM inquiry_answers WHERE inquiry_id = ANY($1::uuid[]) ORDER BY created_at`, [inquiryList.map((i) => i.id)])
      : [];
    for (const i of inquiryList) i.answers = answers.filter((a) => a.inquiry_id === i.id);
    unclear = inquiries.unclearCriteria(criteria, facts);
  }
  const consents = entity
    ? await db.many(`SELECT * FROM consents WHERE entity_id = $1 AND site_id = $2 ORDER BY withdrawn_at NULLS FIRST, granted_at DESC`, [entity.id, ranking.site_id])
    : [];
  const personas = Object.fromEntries((await db.many('SELECT id, name FROM personas')).map((p) => [p.id, p.name]));
  // Leistungen: Katalog, abgeleitete (aus Fakten) und manuell gepflegte
  const featureCatalog = await featureService.catalog(ranking.entity_type);
  const present = entity ? await featureService.forEntity(ranking.entity_type, entity.id) : [];
  const manualFeatures = entity ? await db.many('SELECT * FROM entity_features WHERE entity_id = $1', [entity.id]) : [];
  return {
    sub, ranking, categories, criteria, entity, er, facts, climate, images, result, emails, inquiryList, unclear, consents, personas,
    featureCatalog, presentFeatureIds: present.map((f) => f.id), manualFeatures,
  };
}

router.get('/meldungen/:id', wrap(async (req, res, next) => {
  const d = await loadDetail(req.params.id);
  if (!d) return next();
  const factByCrit = Object.fromEntries(d.facts.map((f) => [f.criterion_id, f]));
  const detailByCrit = Object.fromEntries(d.result.details.map((x) => [x.criterionId, x]));
  const criteriaByCode = Object.fromEntries(d.criteria.map((c) => [c.code, c]));
  res.render('admin/detail', {
    title: d.sub.entity_name,
    ...d,
    factByCrit,
    detailByCrit,
    criteriaByCode,
    TRUST_LABELS,
    IMAGE_SOURCES,
    CONSENT_TYPES: require('../lib/consents').TYPES,
    describeValue: scoring.describeValue,
    flash: req.query.ok || null,
    error: req.query.fehler || null,
  });
}));

// Formularwert -> Wert-JSON. Ergebnis: undefined = unbekannt, null = ungültig
function parseAdminValue(c, raw) {
  const v = raw === undefined || raw === null ? '' : String(raw).trim();
  if (v === '') return undefined;
  const s = c.scoring;
  switch (s.type) {
    case 'option':
      return Object.prototype.hasOwnProperty.call(s.points || {}, v) ? { option: v } : null;
    case 'bool':
      return v === 'true' ? { bool: true } : v === 'false' ? { bool: false } : null;
    case 'rating':
    case 'bands': {
      const n = Number(v.replace(',', '.'));
      return Number.isFinite(n) ? { number: n } : null;
    }
    default:
      return undefined; // climate: kommt aus climate_monthly
  }
}

router.post('/meldungen/:id/fakten', wrap(async (req, res, next) => {
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [req.params.id]);
  if (!sub || !sub.entity_id) return next();
  const criteria = await rankings.getCriteria(sub.ranking_id);
  const existing = Object.fromEntries((await rankings.getFacts(sub.entity_id, sub.ranking_id)).map((f) => [f.criterion_id, f]));
  const input = req.body.facts || {};
  const adminId = req.session.admin.id;
  const errors = [];

  await db.tx(async (client) => {
    for (const c of criteria) {
      const f = input[c.id];
      if (!f || c.scoring.type === 'climate') continue;
      const value = parseAdminValue(c, f.value);
      const old = existing[c.id];
      if (value === null) {
        errors.push(c.label);
        continue;
      }
      if (value === undefined) {
        if (old) {
          await client.query('DELETE FROM entity_facts WHERE id = $1', [old.id]);
          await logAction(adminId, 'fact', old.id, 'delete_fact', { criterion: c.code, old: old.value }, client);
        }
        continue;
      }
      const trust = TRUST_SOURCE[Number(f.trust)] ? Number(f.trust) : 2;
      const evidenceUrl = normalizeUrl(f.evidence_url) || null;
      const evidenceText = String(f.evidence_text || '').trim().slice(0, 1000) || null;
      const disputed = f.disputed === 'on';
      const valueChanged = !old || JSON.stringify(old.value) !== JSON.stringify(value);
      const changed =
        valueChanged || old.trust_level !== trust || old.evidence_url !== evidenceUrl || old.evidence_text !== evidenceText || old.disputed !== disputed;
      if (!changed) continue;
      const row = await client.query(
        `INSERT INTO entity_facts (entity_id, criterion_id, value, source, trust_level, evidence_url, evidence_text, disputed, checked_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (entity_id, criterion_id) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source,
           trust_level = EXCLUDED.trust_level, evidence_url = EXCLUDED.evidence_url, evidence_text = EXCLUDED.evidence_text,
           disputed = EXCLUDED.disputed,
           checked_at = CASE WHEN entity_facts.value <> EXCLUDED.value OR entity_facts.trust_level <> EXCLUDED.trust_level
                             THEN now() ELSE entity_facts.checked_at END
         RETURNING id`,
        [sub.entity_id, c.id, JSON.stringify(value), TRUST_SOURCE[trust], trust, evidenceUrl, evidenceText, disputed]
      );
      await logAction(adminId, 'fact', row.rows[0].id, 'edit_fact', {
        criterion: c.code, old: old ? { value: old.value, trust: old.trust_level } : null, new: { value, trust },
      }, client);
    }
  });
  await rankings.recomputeEntity(sub.entity_id, sub.ranking_id);
  const q = errors.length ? `fehler=${encodeURIComponent('Ungültige Werte: ' + errors.join(', '))}` : 'ok=Fakten+gespeichert';
  res.redirect(`/admin/meldungen/${sub.id}?${q}#fakten`);
}));

// Live-Score-Vorschau beim Bearbeiten (ohne zu speichern)
router.post('/api/score-preview', wrap(async (req, res) => {
  if (!UUID_RE.test(String(req.body.submissionId || ''))) return res.status(400).json({ error: 'submissionId' });
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [req.body.submissionId]);
  if (!sub) return res.status(404).json({ error: 'not found' });
  const ranking = await rankings.getRanking(sub.ranking_id);
  const criteria = await rankings.getCriteria(ranking.id);
  const facts = {};
  for (const c of criteria) {
    const raw = req.body.facts && req.body.facts[c.id];
    const v = parseAdminValue(c, raw);
    if (v) facts[c.id] = v;
  }
  const climate = sub.entity_id ? await rankings.getClimate(sub.entity_id) : [];
  const r = scoring.computeScore(criteria, facts, climate, { month: req.body.month, formula: ranking.formula, labels: ranking.labels });
  res.json({
    score: r.score, factScore: r.factScore, completeness: r.completeness, label: r.label, ko: r.ko, koReason: r.koReason,
    eligible: r.eligible, month: r.month, details: r.details.map((d) => ({ id: d.criterionId, points: d.points, known: d.known, invalid: d.invalid })),
  });
}));

router.post('/meldungen/:id/objekt', wrap(async (req, res, next) => {
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [req.params.id]);
  if (!sub || !sub.entity_id) return next();
  const old = await db.one('SELECT * FROM entities WHERE id = $1', [sub.entity_id]);
  const b = req.body;
  const num = (v) => (String(v || '').trim() === '' ? null : Number(String(v).replace(',', '.')));
  const upd = {
    name: String(b.name || old.name).trim(),
    city: String(b.city || '').trim() || null,
    country: String(b.country || '').trim().toUpperCase().slice(0, 2) || null,
    website: normalizeUrl(b.website),
    lat: num(b.lat),
    lng: num(b.lng),
    booking_url: normalizeUrl(b.booking_url),
    booking_provider: String(b.booking_provider || '').trim() || null,
    contact_email: String(b.contact_email || '').trim().toLowerCase() || null,
  };
  if (upd.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(upd.contact_email)) {
    return res.redirect(`/admin/meldungen/${sub.id}?fehler=${encodeURIComponent('Kontakt-E-Mail ist ungültig.')}`);
  }
  const emailChanged = (old.contact_email || null) !== upd.contact_email;
  await db.query(
    `UPDATE entities SET name=$2, city=$3, country=$4, website=$5, lat=$6, lng=$7, booking_url=$8, booking_provider=$9,
       contact_email=$10,
       contact_email_source = CASE WHEN $11 THEN 'admin' ELSE contact_email_source END,
       contact_email_evidence = CASE WHEN $11 THEN NULL ELSE contact_email_evidence END,
       updated_at=now() WHERE id=$1`,
    [old.id, upd.name, upd.city, upd.country, upd.website, upd.lat, upd.lng, upd.booking_url, upd.booking_provider,
      upd.contact_email, emailChanged]
  );
  const diff = Object.fromEntries(Object.entries(upd).filter(([k, v]) => String(old[k] ?? '') !== String(v ?? '')).map(([k, v]) => [k, { old: old[k], new: v }]));
  if (Object.keys(diff).length) await logAction(req.session.admin.id, 'entity', old.id, 'edit_entity', diff);
  res.redirect(`/admin/meldungen/${sub.id}?ok=Stammdaten+gespeichert`);
}));

router.post('/meldungen/:id/freigeben', wrap(async (req, res) => {
  try {
    await submissions.approve(req.params.id, req.session.admin.id);
    res.redirect(`/admin/meldungen/${req.params.id}?ok=Freigegeben+und+Mail+versendet`);
  } catch (err) {
    res.redirect(`/admin/meldungen/${req.params.id}?fehler=${encodeURIComponent(err.message)}`);
  }
}));

router.post('/meldungen/:id/ablehnen', wrap(async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (!reason) return res.redirect(`/admin/meldungen/${req.params.id}?fehler=Bitte+eine+Begr%C3%BCndung+angeben`);
  await submissions.reject(req.params.id, req.session.admin.id, reason);
  res.redirect(`/admin/meldungen/${req.params.id}?ok=Abgelehnt`);
}));

router.post('/meldungen/:id/zurueckstellen', wrap(async (req, res) => {
  await submissions.hold(req.params.id, req.session.admin.id, String(req.body.note || '').trim());
  res.redirect(`/admin/meldungen/${req.params.id}?ok=Notiz+gespeichert`);
}));

router.post('/meldungen/:id/pruefen', wrap(async (req, res, next) => {
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [req.params.id]);
  if (!sub) return next();
  if (!['verified', 'auto_check', 'admin_review'].includes(sub.status)) {
    return res.redirect(`/admin/meldungen/${sub.id}?fehler=Auto-Pr%C3%BCfung+nur+vor+der+Freigabe+m%C3%B6glich`);
  }
  await submissions.setStatus(sub.id, 'verified');
  await logAction(req.session.admin.id, 'submission', sub.id, 'rerun_auto_check');
  const jobs = require('../jobs/auto-check');
  jobs.run(sub.id).catch((err) => console.error('[admin] auto-check', err));
  res.redirect(`/admin/meldungen/${sub.id}?ok=Auto-Pr%C3%BCfung+l%C3%A4uft`);
}));

// ---------- Leistungen je Objekt (nur Katalog-Einträge ohne Ableitung) ----------

router.post('/meldungen/:id/leistungen', wrap(async (req, res, next) => {
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [req.params.id]);
  if (!sub || !sub.entity_id) return next();
  const entity = await db.one('SELECT entity_type FROM entities WHERE id = $1', [sub.entity_id]);
  const manualCatalog = (await featureService.catalog(entity.entity_type)).filter((f) => !f.derive);
  const wanted = new Set([].concat(req.body.features || []));
  const existing = await db.many('SELECT * FROM entity_features WHERE entity_id = $1', [sub.entity_id]);
  const has = new Set(existing.map((e) => e.feature_id));
  const added = [];
  const removed = [];
  await db.tx(async (c) => {
    for (const f of manualCatalog) {
      if (wanted.has(f.id) && !has.has(f.id)) {
        await c.query(
          `INSERT INTO entity_features (entity_id, feature_id, source, trust_level) VALUES ($1, $2, 'admin', 2)`, [sub.entity_id, f.id]
        );
        added.push(f.code);
      } else if (!wanted.has(f.id) && has.has(f.id)) {
        await c.query('DELETE FROM entity_features WHERE entity_id = $1 AND feature_id = $2', [sub.entity_id, f.id]);
        removed.push(f.code);
      } else if (wanted.has(f.id) && req.body[`confirm_${f.id}`] === 'on') {
        // automatisch vorgeschlagene Leistung bestätigen
        await c.query(
          `UPDATE entity_features SET source = 'admin', trust_level = 2, checked_at = now() WHERE entity_id = $1 AND feature_id = $2 AND trust_level = 4`,
          [sub.entity_id, f.id]
        );
      }
    }
    if (added.length || removed.length) await logAction(req.session.admin.id, 'entity', sub.entity_id, 'edit_features', { added, removed }, c);
  });
  res.redirect(`/admin/meldungen/${sub.id}?ok=Leistungen+gespeichert#leistungen`);
}));

// ---------- Anfragen an den Betreiber ----------

// Rücksprung nur auf interne Admin-Seiten (kein offener Redirect)
function safeBack(v) {
  const back = String(v || '');
  return /^\/admin(\/[\w\/-]*)?(#[\w-]+)?$/.test(back) ? back : '/admin/aufgaben';
}

router.post('/meldungen/:id/anfrage', wrap(async (req, res, next) => {
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [req.params.id]);
  if (!sub || !sub.entity_id) return next();
  const ids = [].concat(req.body.criteria || []).filter((v) => UUID_RE.test(v));
  try {
    await inquiries.start({
      entityId: sub.entity_id, rankingId: sub.ranking_id, submissionId: sub.id, criteriaIds: ids,
      askPhotos: req.body.ask_photos === 'on', adminNote: String(req.body.note || '').trim().slice(0, 1000), adminId: req.session.admin.id,
    });
    res.redirect(`/admin/meldungen/${sub.id}?ok=${encodeURIComponent('Anfrage gestartet – der Agent formuliert und versendet sie.')}#anfragen`);
  } catch (err) {
    res.redirect(`/admin/meldungen/${sub.id}?fehler=${encodeURIComponent(err.message)}#anfragen`);
  }
}));

router.post('/antworten/:answerId/uebernehmen', wrap(async (req, res) => {
  await inquiries.acceptAnswer(req.params.answerId, req.session.admin.id);
  res.redirect(safeBack(req.body.back));
}));

router.post('/antworten/:answerId/verwerfen', wrap(async (req, res) => {
  await inquiries.rejectAnswer(req.params.answerId, req.session.admin.id);
  res.redirect(safeBack(req.body.back));
}));

// Einwilligungen: manuell erfassen (z. B. telefonisch/schriftlich) und widerrufen
router.post('/objekte/:entityId/einwilligungen', wrap(async (req, res) => {
  const back = safeBack(req.body.back);
  try {
    await inquiries.addConsent({
      entityId: req.params.entityId, siteId: req.body.site_id, type: req.body.type,
      contactEmail: String(req.body.contact_email || '').trim(), contactName: String(req.body.contact_name || '').trim(),
      note: String(req.body.note || '').trim(), adminId: req.session.admin.id,
    });
    res.redirect(back);
  } catch (err) {
    res.redirect(`${back.split('#')[0]}?fehler=${encodeURIComponent(err.message)}#einwilligungen`);
  }
}));

router.post('/einwilligungen/:consentId/widerrufen', wrap(async (req, res) => {
  await inquiries.withdrawConsent(req.params.consentId, req.session.admin.id, String(req.body.note || '').trim());
  res.redirect(safeBack(req.body.back));
}));

router.post('/anfragen/:inquiryId/schliessen', wrap(async (req, res) => {
  await inquiries.close(req.params.inquiryId, req.session.admin.id);
  res.redirect(safeBack(req.body.back));
}));

// ---------- Objekt selbst anlegen (ohne Bestätigungsmail) ----------

router.get('/neu', wrap(async (req, res) => {
  const all = await db.many(`SELECT * FROM rankings WHERE status <> 'archived' ORDER BY is_default DESC, name`);
  res.render('admin/new', { title: 'Objekt anlegen', rankings: all, errors: [], form: {} });
}));

router.post('/neu', wrap(async (req, res) => {
  const ranking = UUID_RE.test(req.body.ranking_id || '') ? await rankings.getRanking(req.body.ranking_id) : null;
  const form = {
    name: String(req.body.name || '').trim(),
    city: String(req.body.city || '').trim(),
    country: String(req.body.country || '').trim().toUpperCase(),
    website: normalizeUrl(req.body.website),
    notes: String(req.body.notes || '').trim() || null,
  };
  const errors = [];
  if (!ranking) errors.push('Ranking wählen.');
  if (!form.name || !form.city) errors.push('Name und Ort sind Pflicht.');
  if (!/^[A-Z]{2}$/.test(form.country)) errors.push('Land als zweistelliger Code (z. B. ES).');
  if (!form.website) errors.push('Gültige Website angeben.');
  if (errors.length) {
    const all = await db.many(`SELECT * FROM rankings WHERE status <> 'archived' ORDER BY is_default DESC, name`);
    return res.status(422).render('admin/new', { title: 'Objekt anlegen', rankings: all, errors, form: { ...form, ranking_id: req.body.ranking_id } });
  }
  const sub = await submissions.create(ranking, form, { adminId: req.session.admin.id });
  res.redirect(`/admin/meldungen/${sub.id}?ok=Angelegt%2C+Auto-Pr%C3%BCfung+l%C3%A4uft`);
}));

// ---------- Bilder ----------

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      fs.mkdirSync(config.uploadDir, { recursive: true });
      cb(null, config.uploadDir);
    },
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

router.post('/objekte/:entityId/bilder', upload.single('file'), wrap(async (req, res) => {
  const b = req.body;
  const back = `/admin/meldungen/${b.submission_id}`;
  const missing = ['license', 'credit', 'release_proof'].filter((k) => !String(b[k] || '').trim());
  if (!req.file || !IMAGE_SOURCES[b.source] || missing.length) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.redirect(`${back}?fehler=${encodeURIComponent('Bild, Quelle, Lizenz, Urhebervermerk und Nachweis sind Pflicht.')}#bilder`);
  }
  const img = await db.one(
    `INSERT INTO entity_images (entity_id, storage_path, source, license, credit, source_url, release_proof, valid_until, is_primary)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [req.params.entityId, req.file.filename, b.source, b.license.trim(), b.credit.trim(), normalizeUrl(b.source_url),
      b.release_proof.trim(), b.valid_until || null, b.is_primary === 'on']
  );
  await logAction(req.session.admin.id, 'image', img.id, 'upload_image', { source: b.source, license: b.license });
  res.redirect(`${back}?ok=Bild+hochgeladen+%E2%80%93+noch+nicht+freigegeben#bilder`);
}));

router.get('/bilder/:id/datei', wrap(async (req, res, next) => {
  const img = await db.one('SELECT storage_path FROM entity_images WHERE id = $1', [req.params.id]);
  if (!img) return next();
  res.sendFile(path.join(config.uploadDir, path.basename(img.storage_path)));
}));

router.post('/bilder/:id/freigeben', wrap(async (req, res) => {
  await db.query('UPDATE entity_images SET approved_at = now(), approved_by = $2 WHERE id = $1', [req.params.id, req.session.admin.id]);
  await logAction(req.session.admin.id, 'image', req.params.id, 'approve_image');
  res.redirect(`/admin/meldungen/${req.body.submission_id}?ok=Bild+freigegeben#bilder`);
}));

// Löschen = auch Takedown auf Verlangen des Rechteinhabers
router.post('/bilder/:id/loeschen', wrap(async (req, res) => {
  const img = await db.one('DELETE FROM entity_images WHERE id = $1 RETURNING *', [req.params.id]);
  if (img) {
    fs.unlink(path.join(config.uploadDir, path.basename(img.storage_path)), () => {});
    await logAction(req.session.admin.id, 'image', img.id, 'delete_image', { reason: req.body.reason || null, license: img.license, credit: img.credit });
  }
  res.redirect(`/admin/meldungen/${req.body.submission_id}?ok=Bild+entfernt#bilder`);
}));

// ---------- Aufgaben ----------

router.get('/aufgaben', wrap(async (req, res) => {
  const disputed = await db.many(
    `SELECT f.*, c.label AS criterion_label, e.name AS entity_name, s.id AS submission_id
       FROM entity_facts f JOIN criteria c ON c.id = f.criterion_id JOIN entities e ON e.id = f.entity_id
       LEFT JOIN LATERAL (SELECT id FROM submissions WHERE entity_id = e.id AND ranking_id = c.ranking_id ORDER BY created_at DESC LIMIT 1) s ON true
      WHERE f.disputed ORDER BY e.name`
  );
  const recheck = await db.many(
    `SELECT f.*, c.label AS criterion_label, e.name AS entity_name, s.id AS submission_id
       FROM entity_facts f JOIN criteria c ON c.id = f.criterion_id JOIN rankings r ON r.id = c.ranking_id
       JOIN entities e ON e.id = f.entity_id
       JOIN entity_rankings er ON er.entity_id = e.id AND er.ranking_id = r.id AND er.status = 'live'
       LEFT JOIN LATERAL (SELECT id FROM submissions WHERE entity_id = e.id AND ranking_id = r.id ORDER BY created_at DESC LIMIT 1) s ON true
      WHERE f.checked_at < now() - make_interval(months => COALESCE((r.formula->>'recheck_months')::int, 18))
      ORDER BY f.checked_at LIMIT 200`
  );
  const images = await db.many(
    `SELECT i.*, e.name AS entity_name, s.id AS submission_id
       FROM entity_images i JOIN entities e ON e.id = i.entity_id
       LEFT JOIN LATERAL (SELECT id FROM submissions WHERE entity_id = e.id ORDER BY created_at DESC LIMIT 1) s ON true
      WHERE (i.valid_until IS NOT NULL AND i.valid_until < current_date + 30) OR i.approved_at IS NULL
      ORDER BY i.valid_until NULLS LAST`
  );
  const answers = await db.many(
    `SELECT a.*, c.label AS criterion_label, c.scoring, e.name AS entity_name, i.submission_id, i.answered_at, i.reply_name
       FROM inquiry_answers a JOIN inquiries i ON i.id = a.inquiry_id JOIN criteria c ON c.id = a.criterion_id
       JOIN entities e ON e.id = i.entity_id
      WHERE a.status = 'pending' ORDER BY i.answered_at`
  );
  const failedInquiries = await db.many(
    `SELECT i.*, e.name AS entity_name FROM inquiries i JOIN entities e ON e.id = i.entity_id WHERE i.status = 'failed' ORDER BY i.updated_at DESC`
  );
  const stuck = await db.many(
    `SELECT * FROM submissions WHERE status IN ('verified','auto_check') AND updated_at < now() - interval '1 hour' ORDER BY updated_at`
  );
  res.render('admin/tasks', { title: 'Aufgaben', disputed, recheck, images, stuck, answers, failedInquiries, describeValue: scoring.describeValue });
}));

// ---------- Audit-Log ----------

router.get('/log', wrap(async (req, res) => {
  const rows = await db.many(
    `SELECT a.*, u.email, p.name AS persona_name FROM admin_actions a
       LEFT JOIN admin_users u ON u.id = a.admin_id LEFT JOIN personas p ON p.id = a.persona_id
      ORDER BY a.created_at DESC LIMIT 300`
  );
  res.render('admin/log', { title: 'Log', rows });
}));

module.exports = router;
module.exports.parseAdminValue = parseAdminValue;
