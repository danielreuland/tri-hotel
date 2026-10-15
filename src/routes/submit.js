// Formular „hinzufügen“ (/<objekttyp>-hinzufuegen, z. B. /hotel-hinzufuegen) und Bestätigungslink.
// Öffentlich heißt es „Vorschlag“, intern (Admin, Datenbank) weiter „Meldung“/submission.
// Version 1: nur für das Ranking des Hosts; Formular und Pipeline sind ranking-parametrisiert.
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const config = require('../config');
const submissions = require('../services/submissions');
const reviews = require('../services/reviews');
const rankings = require('../services/rankings');
const { normalizeUrl, isEmail } = require('../lib/util');

const router = express.Router();
// Fotos zur Bewertung, die man gleich mit abgeben kann
const upload = multer({
  dest: path.join(config.uploadDir, 'tmp'),
  limits: { fileSize: 8 * 1024 * 1024, files: reviews.MAX_PHOTOS + 1 },
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

const ROLES = { guest: 'Gast', coach: 'Trainer', owner: 'Betreiber', other: 'Sonstiges' };

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).render('public/error', { title: 'Zu viele Vorschläge', message: 'Bitte versuche es in einer Stunde noch einmal.' }),
});

async function formRanking(req, res, next) {
  const r = req.hostRanking;
  if (!r || req.params.type !== r.entity_type) return next('route');
  req.ranking = r;
  // Kriterien, die der Melder optional angeben darf (criteria.scoring.ask_submitter)
  req.askCriteria = (await rankings.getCriteria(r.id)).filter(
    (c) => c.scoring.ask_submitter && ['option', 'bool'].includes(c.scoring.type)
  );
  next();
}

async function render(req, res, form = { hints: {} }, errors = []) {
  const reviewCfg = reviews.config(req.ranking);
  const camps = reviewCfg.enabled
    ? await db.many(`SELECT id, name FROM camp_providers WHERE site_id = $1 AND status = 'active' ORDER BY name`, [req.site.id])
    : [];
  const months = [];
  const now = new Date();
  for (let i = 0; i < 36; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }) });
  }
  res.status(errors.length ? 422 : 200).render('public/submit', {
    reviewCfg, camps, months, MAX_PHOTOS: reviews.MAX_PHOTOS, PHOTO_CONSENT: reviews.PHOTO_CONSENT,
    title: `${req.ranking.entity_label_sg} hinzufügen`,
    description: `Du kennst ein ${req.ranking.entity_label_sg}, das in den Vergleich gehört? Schlag es vor – wir prüfen jeden Eintrag, bevor er online geht.`,
    ranking: req.ranking,
    askCriteria: req.askCriteria,
    form,
    errors,
    roles: ROLES,
  });
}

function validHint(c, v) {
  if (c.scoring.type === 'bool') return v === 'true' || v === 'false';
  return Object.prototype.hasOwnProperty.call(c.scoring.points || {}, v);
}

function validate(body, askCriteria) {
  const errors = [];
  const form = {
    name: String(body.name || '').trim().slice(0, 200),
    city: String(body.city || '').trim().slice(0, 120),
    country: String(body.country || '').trim().toUpperCase().slice(0, 2),
    website: normalizeUrl(body.website),
    email: String(body.email || '').trim().toLowerCase().slice(0, 200),
    role: ROLES[body.role] ? body.role : null,
    notes: String(body.notes || '').trim().slice(0, 2000) || null,
    hints: {},
  };
  // Optionale Angaben des Melders: hint_<kriterium-code>, nur gültige Ausprägungen
  for (const c of askCriteria) {
    const v = String(body[`hint_${c.code}`] || '');
    if (v && validHint(c, v)) form.hints[c.code] = v;
  }
  if (!form.name) errors.push('Bitte den Namen angeben.');
  if (!form.city) errors.push('Bitte den Ort angeben.');
  if (!/^[A-Z]{2}$/.test(form.country)) errors.push('Bitte ein Land auswählen.');
  if (!form.website) errors.push('Bitte eine gültige Website angeben.');
  if (!isEmail(form.email)) errors.push('Bitte eine gültige E-Mail-Adresse angeben.');
  if (body.privacy !== 'on') errors.push('Bitte der Datenschutzerklärung zustimmen.');
  return { form, errors };
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/:type-hinzufuegen', wrap(formRanking), wrap((req, res) => render(req, res)));

// Alte Adresse /<objekttyp>-melden dauerhaft weiterleiten
router.get('/:type-melden', (req, res, next) => {
  if (!req.hostRanking || req.params.type !== req.hostRanking.entity_type) return next();
  res.redirect(301, `/${req.params.type}-hinzufuegen`);
});

const REVIEW_FIELDS = ['author_name', 'stay_month', 'camp_provider_id', 'title', 'body', 'photo_consent', 'honest'];

router.post('/:type-hinzufuegen', wrap(formRanking), submitLimiter, (req, res, next) => {
  upload.array('photos', reviews.MAX_PHOTOS + 1)(req, res, (err) => {
    if (err) req.uploadError = err.code === 'LIMIT_FILE_SIZE' ? 'Ein Foto ist größer als 8 MB.' : `Höchstens ${reviews.MAX_PHOTOS} Fotos (JPG, PNG, WebP).`;
    next();
  });
}, async (req, res, next) => {
  const files = req.files || [];
  const cleanup = () => files.forEach((f) => fs.unlink(f.path, () => {}));
  try {
    // Honeypot: echte Nutzer sehen das Feld nicht
    if (req.body.company_url) { cleanup(); return res.render('public/submitted', { title: 'Danke', ranking: req.ranking }); }
    const { form, errors } = validate(req.body, req.askCriteria);
    // Bewertung gleich mit abgeben – nicht als Betreiber (keine Eigenbewertung)
    const cfg = reviews.config(req.ranking);
    form.withReview = cfg.enabled && req.body.with_review === 'on' && form.role !== 'owner';
    form.review = Object.fromEntries(REVIEW_FIELDS.map((k) => [k, req.body[k]]).concat(cfg.dimensions.map((d) => [`r_${d.code}`, req.body[`r_${d.code}`]])));
    let reviewData = null;
    if (form.withReview) {
      const r = await reviews.validate(req.ranking, { ...req.body, email: form.email }, files);
      errors.push(...r.errors.filter((e) => !/E-Mail/.test(e) || !errors.some((x) => /E-Mail/.test(x))));
      if (req.uploadError) errors.push(req.uploadError);
      reviewData = r.data;
    }
    if (!form.withReview || errors.length) cleanup();
    if (errors.length) return await render(req, res, { ...form, website: req.body.website }, errors);
    if ((await submissions.recentCountByIp(req.ip)) >= 10) {
      cleanup();
      return await render(req, res, form, ['Von deinem Anschluss kamen heute schon viele Vorschläge. Bitte versuche es morgen wieder.']);
    }
    const sub = await submissions.create(req.ranking, form, { ip: req.ip });
    if (reviewData) await reviews.createHeld({ ranking: req.ranking, submissionId: sub.id, data: reviewData, ip: req.ip });
    res.render('public/submitted', { title: 'Danke', ranking: req.ranking, withReview: Boolean(reviewData) });
  } catch (err) {
    cleanup();
    next(err);
  }
});

router.get('/bestaetigen/:token', async (req, res, next) => {
  try {
    const result = await submissions.verify(req.params.token);
    res.render('public/verified', { title: 'Bestätigung', result: result.status });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
