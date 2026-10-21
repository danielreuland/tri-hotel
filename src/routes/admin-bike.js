// Radreviere: Profile je Gebiet (Region oder Rasterkachel) ansehen, Teilwertungen übersteuern, neu berechnen.
// Übersteuerung gilt für alle Hotels des Gebiets (unbestätigte Vorschläge werden angeglichen, bestätigte Werte nicht).
const express = require('express');
const db = require('../db');
const bike = require('../services/bike-area');
const { requireAdmin } = require('../middleware/context');
const { logAction } = require('../lib/audit');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEYS = ['network', 'traffic', 'terrain', 'routes'];
router.use(requireAdmin);
router.param('id', (req, res, next, v) => (UUID_RE.test(v) ? next() : next('route')));

router.get('/', wrap(async (req, res) => {
  const areas = await db.many('SELECT * FROM bike_areas ORDER BY score DESC NULLS LAST, name');
  const crits = await bike.bikeCriteria();
  const rule = (crits[0] && crits[0].rule) || {};
  for (const a of areas) {
    a.entities = await bike.entitiesOf(a.key);
    a.merged = bike.areaScore(a.subscores || {}, a.override || {}).merged;
  }
  res.render('admin/bike-areas', { title: 'Radreviere', areas, rule, KEYS, flash: req.query.ok || null, flashError: req.query.fehler || null });
}));

// Teilwertungen übersteuern (leer = automatisch) mit Begründung
router.post('/:id/uebersteuern', wrap(async (req, res) => {
  const area = await db.one('SELECT * FROM bike_areas WHERE id = $1', [req.params.id]);
  if (!area) return res.redirect('/admin/radreviere');
  const crits = await bike.bikeCriteria();
  const max = ((crits[0] && crits[0].rule) || {}).max || { network: 2, traffic: 1, terrain: 2, routes: 1 };
  const override = {};
  for (const k of KEYS) {
    const raw = String(req.body[k] ?? '').replace(',', '.').trim();
    if (raw === '') continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > max[k]) return res.redirect(`/admin/radreviere?fehler=${encodeURIComponent(`${k}: Wert zwischen 0 und ${max[k]}`)}#a-${area.id}`);
    override[k] = Math.round(n * 2) / 2;
  }
  const note = String(req.body.note || '').trim().slice(0, 500);
  if (note) override.note = note;
  const { score } = bike.areaScore(area.subscores || {}, override);
  const row = await db.one(`UPDATE bike_areas SET override = $2, score = $3, updated_by = $4, updated_at = now() WHERE id = $1 RETURNING *`,
    [area.id, JSON.stringify(override), score, req.session.admin.id]);
  await logAction(req.session.admin.id, 'bike_area', area.id, 'override_bike_area', { previous: area.override, override, score });
  const changed = await bike.applyToEntities(row, req.session.admin.id);
  res.redirect(`/admin/radreviere?ok=${encodeURIComponent(`${row.name}: ${score} von 6 – ${changed} Vorschläge angeglichen`)}#a-${area.id}`);
}));

// Neu berechnen (OpenStreetMap + Höhendaten), Übersteuerung bleibt erhalten
router.post('/:id/neu-berechnen', wrap(async (req, res) => {
  const area = await db.one('SELECT * FROM bike_areas WHERE id = $1', [req.params.id]);
  if (!area) return res.redirect('/admin/radreviere');
  const crits = await bike.bikeCriteria();
  try {
    const row = await bike.getArea({ key: area.key, regionId: area.region_id, name: area.name, lat: Number(area.lat), lng: Number(area.lng), radiusKm: Number(area.radius_km) },
      (crits[0] && crits[0].rule) || {}, { force: true });
    const changed = await bike.applyToEntities(row, req.session.admin.id);
    res.redirect(`/admin/radreviere?ok=${encodeURIComponent(`${row.name} neu berechnet: ${row.score} von 6 – ${changed} Vorschläge angeglichen`)}#a-${area.id}`);
  } catch (err) {
    res.redirect(`/admin/radreviere?fehler=${encodeURIComponent(`Berechnung fehlgeschlagen: ${err.message}`)}#a-${area.id}`);
  }
}));

module.exports = router;
