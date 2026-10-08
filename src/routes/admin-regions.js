// Regionen verwalten (SEO-Landingpages): Name, „auf/am/an …“, Mittelpunkt + Radius, Einleitungstext.
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/context');
const { logAction } = require('../lib/audit');
const { slugify } = require('../lib/util');

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
    intro: String(b.intro || '').trim().slice(0, 2000) || null,
    status: ['draft', 'active', 'archived'].includes(b.status) ? b.status : 'active',
    sort_order: Number(b.sort_order) || 100,
  };
  if (!f.site_id) errors.push('Site wählen.');
  if (!f.name || !f.name_in || !f.slug) errors.push('Name, „auf/am …“ und Slug sind Pflicht.');
  if (!/^[A-Z]{2}$/.test(f.country)) errors.push('Land als zweistelliger Code.');
  if (!(Math.abs(f.lat) <= 90) || !(Math.abs(f.lng) <= 180) || !(f.radius_km > 0 && f.radius_km <= 500)) errors.push('Koordinaten und Radius (1–500 km) prüfen.');
  return { f, errors };
}

async function render(res, extra = {}) {
  const rows = await db.many(`SELECT r.*, s.name AS site_name FROM regions r JOIN sites s ON s.id = r.site_id ORDER BY s.name, r.sort_order, r.name`);
  const sites = await db.many(`SELECT id, name FROM sites ORDER BY is_default DESC, name`);
  res.render('admin/regions', { title: 'Regionen', rows, sites, errors: [], flash: null, edit: null, ...extra });
}

router.get('/', wrap(async (req, res) => render(res, { flash: req.query.ok || null })));
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
        `UPDATE regions SET site_id=$2, name=$3, name_in=$4, slug=$5, country=$6, lat=$7, lng=$8, radius_km=$9, intro=$10, status=$11, sort_order=$12, updated_at=now() WHERE id=$1`,
        [req.params.id, f.site_id, f.name, f.name_in, f.slug, f.country, f.lat, f.lng, f.radius_km, f.intro, f.status, f.sort_order]
      );
      await logAction(req.session.admin.id, 'region', req.params.id, 'edit_region', { name: f.name, radius_km: f.radius_km });
    } else {
      const row = await db.one(
        `INSERT INTO regions (site_id, name, name_in, slug, country, lat, lng, radius_km, intro, status, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [f.site_id, f.name, f.name_in, f.slug, f.country, f.lat, f.lng, f.radius_km, f.intro, f.status, f.sort_order]
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
