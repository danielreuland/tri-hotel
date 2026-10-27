// Regionen verwalten (SEO-Landingpages): Name, „auf/am/an …“, Mittelpunkt + Radius, Einleitungstext.
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/context');
const { logAction } = require('../lib/audit');
const { slugify } = require('../lib/util');
const regionData = require('../services/region-data');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.use(requireAdmin);
router.param('id', (req, res, next, v) => (UUID_RE.test(v) ? next() : next('route')));

function readForm(b) {
  const errors = [];
  const num = (v) => Number(String(v || '').replace(',', '.'));
  const f = {
    site_id: UUID_RE.test(b.site_id || '') ? b.site_id : null,
    name: String(b.name || '').trim().slice(0, 80),
    name_in: String(b.name_in || '').trim().slice(0, 80),
    slug: slugify(b.slug || b.name),
    country: String(b.country || '').trim().toUpperCase().slice(0, 2),
    lat: num(b.lat), lng: num(b.lng), radius_km: num(b.radius_km),
    // Klimapunkt optional: beide leer = automatisch (Lage der Hotels bzw. tiefer gelegener Ort nahe der Mitte)
    climate_lat: String(b.climate_lat || '').trim() ? num(b.climate_lat) : null,
    climate_lng: String(b.climate_lng || '').trim() ? num(b.climate_lng) : null,
    intro: String(b.intro || '').trim().slice(0, 2000) || null,
    status: ['draft', 'active', 'archived'].includes(b.status) ? b.status : 'active',
    sort_order: Number(b.sort_order) || 100,
  };
  if (!f.site_id) errors.push('Site wählen.');
  if (!f.name || !f.name_in || !f.slug) errors.push('Name, „auf/am …“ und Slug sind Pflicht.');
  if (!/^[A-Z]{2}$/.test(f.country)) errors.push('Land als zweistelliger Code.');
  if (!(Math.abs(f.lat) <= 90) || !(Math.abs(f.lng) <= 180) || !(f.radius_km > 0 && f.radius_km <= 500)) errors.push('Koordinaten und Radius (1–500 km) prüfen.');
  if ((f.climate_lat === null) !== (f.climate_lng === null) || (f.climate_lat !== null && !(Math.abs(f.climate_lat) <= 90 && Math.abs(f.climate_lng) <= 180))) {
    errors.push('Klimapunkt: Breiten- und Längengrad angeben oder beide leer lassen.');
  }
  return { f, errors };
}

async function render(res, extra = {}) {
  const rows = await db.many(
    `SELECT r.*, s.name AS site_name, b.score AS bike_score, b.computed_at AS bike_at, b.error AS bike_error,
            (SELECT count(*)::int FROM region_climate_monthly c WHERE c.region_id = r.id) AS climate_months
       FROM regions r JOIN sites s ON s.id = r.site_id LEFT JOIN bike_areas b ON b.key = 'region:' || r.id
      ORDER BY s.name, r.sort_order, r.name`);
  const sites = await db.many(`SELECT id, name FROM sites ORDER BY is_default DESC, name`);
  res.render('admin/regions', { title: 'Regionen', rows, sites, errors: [], flash: null, edit: null, climatePointText: regionData.climatePointText, lowM: regionData.LOW_M, minHotels: regionData.MIN_HOTELS, ...extra });
}

router.get('/', wrap(async (req, res) => render(res, { flash: req.query.ok || null })));

// Daten je Region (Klima mit Wind/Sonne/Wasser, Radrevier aus OSM) im Hintergrund berechnen – dauert je Region 1–3 Minuten
router.post('/daten', wrap(async (req, res) => {
  regionData.refreshAll({ force: req.body.alle === '1', log: (t) => console.log('[regionen]', t) }).catch((err) => console.error('[regionen]', err.message));
  await logAction(req.session.admin.id, 'region', req.session.admin.id, 'refresh_all_region_data', { force: req.body.alle === '1' });
  res.redirect(`/admin/regionen?ok=${encodeURIComponent('Berechnung läuft im Hintergrund (je Region 1–3 Minuten) – Seite später neu laden')}`);
}));
router.post('/:id/daten', wrap(async (req, res, next) => {
  const region = await db.one('SELECT * FROM regions WHERE id = $1', [req.params.id]);
  if (!region) return next();
  regionData.refresh(region, { force: true, adminId: req.session.admin.id }).catch((err) => console.error('[regionen]', err.message));
  res.redirect(`/admin/regionen?ok=${encodeURIComponent(`${region.name}: Berechnung läuft (1–3 Minuten) – Seite später neu laden`)}`);
}));
router.get('/:id', wrap(async (req, res, next) => {
  const edit = await db.one('SELECT * FROM regions WHERE id = $1', [req.params.id]);
  if (!edit) return next();
  render(res, { edit });
}));

router.post('/:id?', wrap(async (req, res) => {
  const { f, errors } = readForm(req.body);
  if (errors.length) return render(res, { errors, edit: { ...f, id: req.params.id } });
  try {
    if (req.params.id) {
      await db.query(
        `UPDATE regions SET site_id=$2, name=$3, name_in=$4, slug=$5, country=$6, lat=$7, lng=$8, radius_km=$9, intro=$10, status=$11, sort_order=$12,
           climate_lat=$13, climate_lng=$14, updated_at=now() WHERE id=$1`,
        [req.params.id, f.site_id, f.name, f.name_in, f.slug, f.country, f.lat, f.lng, f.radius_km, f.intro, f.status, f.sort_order, f.climate_lat, f.climate_lng]
      );
      await logAction(req.session.admin.id, 'region', req.params.id, 'edit_region', { name: f.name, radius_km: f.radius_km, climate_lat: f.climate_lat, climate_lng: f.climate_lng });
    } else {
      const row = await db.one(
        `INSERT INTO regions (site_id, name, name_in, slug, country, lat, lng, radius_km, intro, status, sort_order, climate_lat, climate_lng)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [f.site_id, f.name, f.name_in, f.slug, f.country, f.lat, f.lng, f.radius_km, f.intro, f.status, f.sort_order, f.climate_lat, f.climate_lng]
      );
      await logAction(req.session.admin.id, 'region', row.id, 'create_region', { name: f.name });
    }
  } catch (err) {
    if (err.code !== '23505') throw err;
    return render(res, { errors: ['Diesen Slug gibt es auf der Site schon.'], edit: { ...f, id: req.params.id } });
  }
  res.redirect('/admin/regionen?ok=Gespeichert');
}));

module.exports = router;
