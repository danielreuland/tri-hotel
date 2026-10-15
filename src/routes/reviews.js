// Nutzerbewertungen: Formular je Objekt, Bestätigungslink, Fotos freigegebener Bewertungen.
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const config = require('../config');
const reviews = require('../services/reviews');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });
const upload = multer({
  dest: path.join(config.uploadDir, 'tmp'),
  limits: { fileSize: 8 * 1024 * 1024, files: reviews.MAX_PHOTOS + 1 },
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

// Objekt des Host-Rankings mit aktivierten Bewertungen
async function target(req) {
  const r = req.hostRanking;
  if (!r || req.params.type !== r.entity_type || !reviews.config(r).enabled) return null;
  const entity = await db.one('SELECT * FROM entities WHERE entity_type = $1 AND slug = $2', [r.entity_type, req.params.slug]);
  const live = entity && (await db.one(`SELECT 1 FROM entity_rankings WHERE entity_id = $1 AND ranking_id = $2 AND status = 'live'`, [entity.id, r.id]));
  return live ? { ranking: r, entity } : null;
}

async function render(req, res, t, extra = {}) {
  const camps = await db.many(
    `SELECT DISTINCT p.id, p.name FROM camp_providers p LEFT JOIN camp_provider_hotels h ON h.provider_id = p.id
      WHERE p.site_id = $1 AND p.status = 'active' ORDER BY p.name`, [req.site.id]);
  const months = [];
  const now = new Date();
  for (let i = 0; i < 36; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }) });
  }
  res.status(extra.errors && extra.errors.length ? 422 : 200).render('public/review-form', {
    title: `${t.entity.name} bewerten`, noindex: true,
    ranking: t.ranking, entity: t.entity, cfg: reviews.config(t.ranking), questions: await reviews.questions(t.ranking),
    camps, months, MAX_PHOTOS: reviews.MAX_PHOTOS, PHOTO_CONSENT: reviews.PHOTO_CONSENT, form: {}, errors: [], ...extra,
  });
}

router.get('/:type/:slug/bewerten', wrap(async (req, res, next) => {
  const t = await target(req);
  if (!t) return next();
  await render(req, res, t);
}));

router.post('/:type/:slug/bewerten', limiter, (req, res, next) => {
  upload.array('photos', reviews.MAX_PHOTOS + 1)(req, res, (err) => {
    if (err) req.uploadError = err.code === 'LIMIT_FILE_SIZE' ? 'Ein Foto ist größer als 8 MB.' : `Höchstens ${reviews.MAX_PHOTOS} Fotos (JPG, PNG, WebP).`;
    next();
  });
}, wrap(async (req, res, next) => {
  const files = req.files || [];
  const cleanup = () => files.forEach((f) => fs.unlink(f.path, () => {}));
  const t = await target(req);
  if (!t) { cleanup(); return next(); }
  if (req.body.company_url) { cleanup(); return res.render('public/review-done', { title: 'Danke', noindex: true, entity: t.entity, status: 'sent' }); }
  if ((await reviews.recentCountByIp(req.ip)) >= 5) { cleanup(); return render(req, res, t, { errors: ['Zu viele Bewertungen in kurzer Zeit. Bitte versuch es morgen noch einmal.'], form: req.body }); }
  const { errors, data } = await reviews.validate(t.ranking, req.body, files);
  if (req.uploadError) errors.unshift(req.uploadError);
  if (errors.length) { cleanup(); return render(req, res, t, { errors, form: req.body }); }
  // Mehrfach abgeschickt (gleiche Adresse, gleiches Objekt, kurz hintereinander): nur einmal speichern
  const dup = await db.one(
    `SELECT id FROM reviews WHERE entity_id = $1 AND email = $2 AND created_at > now() - interval '30 minutes' LIMIT 1`, [t.entity.id, data.email]);
  if (dup) cleanup();
  else await reviews.create({ ranking: t.ranking, entity: t.entity, site: req.site, data, ip: req.ip });
  res.redirect(303, `/${t.ranking.entity_type}/${t.entity.slug}/bewerten/danke`);
}));

router.get('/:type/:slug/bewerten/danke', wrap(async (req, res, next) => {
  const t = await target(req);
  if (!t) return next();
  res.render('public/review-done', { title: 'Danke für deine Bewertung', noindex: true, entity: t.entity, status: 'sent' });
}));

router.get('/bewertung-bestaetigen/:token', wrap(async (req, res) => {
  const r = await reviews.verify(req.params.token);
  const entity = r.review ? await db.one('SELECT name, slug, entity_type FROM entities WHERE id = $1', [r.review.entity_id]) : null;
  res.render('public/review-done', { title: 'Bewertung bestätigt', noindex: true, entity, status: r.status });
}));

// Fotos nur aus freigegebenen Bewertungen und nur einzeln freigegeben
router.get('/media/review/:file', wrap(async (req, res, next) => {
  const m = /^([0-9a-f-]{36})-(\d{2,4})\.webp$/.exec(req.params.file);
  if (!m) return next();
  const img = await db.one(
    `SELECT i.id, i.variants FROM review_images i JOIN reviews r ON r.id = i.review_id
      WHERE i.id = $1 AND i.approved_at IS NOT NULL AND r.status = 'published'`, [m[1]]);
  if (!img || !img.variants.includes(Number(m[2]))) return next();
  const file = reviews.imageFile(img.id, Number(m[2]));
  if (!fs.existsSync(file)) return next();
  res.set('Cache-Control', 'public, max-age=86400');
  res.sendFile(file);
}));

module.exports = router;
