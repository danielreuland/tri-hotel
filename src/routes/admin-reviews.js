// Bewertungen moderieren: bestätigen (ohne E-Mail), freigeben, ablehnen, löschen, Fotos freigeben, Antwort des Hotels.
const express = require('express');
const fs = require('fs');
const db = require('../db');
const reviews = require('../services/reviews');
const { requireAdmin } = require('../middleware/context');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.use(requireAdmin);
router.param('id', (req, res, next, v) => (UUID_RE.test(v) ? next() : next('route')));

const FILTERS = {
  offen: { label: 'zu prüfen', where: `r.status IN ('received', 'pending')` },
  published: { label: 'veröffentlicht', where: `r.status = 'published'` },
  rejected: { label: 'abgelehnt', where: `r.status = 'rejected'` },
  alle: { label: 'alle', where: 'true' },
};
const STATUS = { received: 'E-Mail unbestätigt', pending: 'wartet auf Freigabe', published: 'veröffentlicht', rejected: 'abgelehnt' };

router.get('/', wrap(async (req, res) => {
  const status = FILTERS[req.query.status] ? req.query.status : 'offen';
  const rows = await db.many(
    `SELECT r.*, e.name AS entity_name, e.slug AS entity_slug, e.entity_type, rk.review_config, p.name AS camp_name,
            (SELECT s.id FROM submissions s WHERE s.entity_id = e.id ORDER BY s.created_at DESC LIMIT 1) AS sub_id
       FROM reviews r JOIN entities e ON e.id = r.entity_id JOIN rankings rk ON rk.id = r.ranking_id
       LEFT JOIN camp_providers p ON p.id = r.camp_provider_id
      WHERE ${FILTERS[status].where} ORDER BY r.created_at DESC LIMIT 200`);
  const imgs = rows.length ? await db.many(`SELECT * FROM review_images WHERE review_id = ANY($1::uuid[]) ORDER BY sort_order`, [rows.map((r) => r.id)]) : [];
  for (const r of rows) r.images = imgs.filter((i) => i.review_id === r.id);
  const counts = Object.fromEntries(await Promise.all(Object.entries(FILTERS).map(async ([k, f]) => [k, (await db.one(`SELECT count(*)::int AS n FROM reviews r WHERE ${f.where}`)).n])));
  res.render('admin/reviews', { title: 'Bewertungen', rows, status, counts, FILTERS, STATUS, flash: req.query.ok || null, error: req.query.fehler || null });
}));

// Vorschau aller Fotos (auch nicht freigegebene)
router.get('/bild/:file', wrap(async (req, res, next) => {
  const m = /^([0-9a-f-]{36})-(\d{2,4})\.webp$/.exec(req.params.file);
  if (!m) return next();
  const file = reviews.imageFile(m[1], Number(m[2]));
  if (!fs.existsSync(file)) return next();
  res.sendFile(file);
}));

const back = (req, msg, err) => `/admin/bewertungen?status=${encodeURIComponent(req.body.status || 'offen')}&${err ? 'fehler' : 'ok'}=${encodeURIComponent(msg)}#r-${req.params.id}`;

router.post('/:id/aktion', wrap(async (req, res) => {
  const a = req.body.action;
  const id = req.params.id;
  const admin = req.session.admin.id;
  try {
    if (a === 'verify') await reviews.verifyByAdmin(id, admin);
    else if (a === 'publish') await reviews.publish(id, admin);
    else if (a === 'reject') await reviews.reject(id, admin, req.body.reason);
    else if (a === 'delete') await reviews.remove(id, admin);
    else if (a === 'reply') await reviews.reply(id, req.body.reply, admin);
    const msgs = { verify: 'Als bestätigt markiert – jetzt freigeben oder ablehnen', publish: 'Bewertung veröffentlicht', reject: 'Bewertung abgelehnt', delete: 'Bewertung gelöscht', reply: 'Antwort gespeichert' };
    res.redirect(back(req, msgs[a] || 'Gespeichert'));
  } catch (err) {
    res.redirect(back(req, err.message, true));
  }
}));

router.post('/bild/:imageId/:action(freigeben|loeschen)', wrap(async (req, res) => {
  if (UUID_RE.test(req.params.imageId)) await reviews.setImage(req.params.imageId, req.params.action === 'freigeben', req.session.admin.id);
  res.redirect(`/admin/bewertungen?status=${encodeURIComponent(req.body.status || 'offen')}&ok=${encodeURIComponent(req.params.action === 'freigeben' ? 'Foto freigegeben' : 'Foto gelöscht')}`);
}));

module.exports = router;
