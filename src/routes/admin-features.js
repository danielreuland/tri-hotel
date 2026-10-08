// Leistungskatalog verwalten: einheitliche Namen je Objekttyp. Umbenennen wirkt sofort bei allen Objekten.
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/context');
const { logAction } = require('../lib/audit');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.use(requireAdmin);
router.param('id', (req, res, next, v) => (UUID_RE.test(v) ? next() : next('route')));

function readForm(b) {
  const errors = [];
  const f = {
    entity_type: String(b.entity_type || '').trim(),
    code: String(b.code || '').trim(),
    label: String(b.label || '').trim().slice(0, 80),
    group_label: String(b.group_label || '').trim().slice(0, 60),
    sort_order: Number(b.sort_order) || 100,
    filterable: b.filterable === 'on',
    active: b.active === 'on',
    derive: null,
  };
  if (!/^[a-z0-9_]+$/.test(f.code)) errors.push('Code: nur Kleinbuchstaben, Ziffern und Unterstriche.');
  if (!f.label || !f.group_label) errors.push('Name und Gruppe sind Pflicht.');
  const raw = String(b.derive || '').trim();
  if (raw) {
    try {
      const d = JSON.parse(raw);
      if (!d.ranking || !d.criterion || !Array.isArray(d.values)) throw new Error();
      f.derive = d;
    } catch {
      errors.push('Ableitung: JSON {"ranking":"…","criterion":"…","values":[…]} oder leer lassen.');
    }
  }
  return { f, errors };
}

async function render(res, extra = {}) {
  const rows = await db.many(`SELECT * FROM features ORDER BY entity_type, sort_order, label`);
  const usage = await db.many(`SELECT feature_id, count(*)::int AS n FROM entity_features GROUP BY feature_id`);
  const types = await db.many(`SELECT DISTINCT entity_type FROM rankings ORDER BY entity_type`);
  res.render('admin/features', {
    title: 'Leistungskatalog', rows, usage: Object.fromEntries(usage.map((u) => [u.feature_id, u.n])),
    types: types.map((t) => t.entity_type), errors: [], flash: null, ...extra,
  });
}

router.get('/', wrap(async (req, res) => render(res, { flash: req.query.ok || null })));

router.post('/', wrap(async (req, res) => {
  const { f, errors } = readForm({ ...req.body, active: 'on' });
  if (errors.length) return render(res, { errors });
  try {
    const row = await db.one(
      `INSERT INTO features (entity_type, code, label, group_label, sort_order, filterable, derive) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [f.entity_type, f.code, f.label, f.group_label, f.sort_order, f.filterable, f.derive ? JSON.stringify(f.derive) : null]
    );
    await logAction(req.session.admin.id, 'feature', row.id, 'create_feature', { code: f.code, label: f.label });
    res.redirect('/admin/leistungen?ok=Leistung+angelegt');
  } catch (err) {
    if (err.code !== '23505') throw err;
    render(res, { errors: ['Code oder Name gibt es für diesen Objekttyp schon – gleiche Leistung, gleicher Name.'] });
  }
}));

router.post('/:id', wrap(async (req, res, next) => {
  const old = await db.one('SELECT * FROM features WHERE id = $1', [req.params.id]);
  if (!old) return next();
  const { f, errors } = readForm({ ...req.body, entity_type: old.entity_type, code: old.code });
  if (errors.length) return render(res, { errors });
  try {
    await db.query(
      `UPDATE features SET label=$2, group_label=$3, sort_order=$4, filterable=$5, active=$6, derive=$7 WHERE id=$1`,
      [old.id, f.label, f.group_label, f.sort_order, f.filterable, f.active, f.derive ? JSON.stringify(f.derive) : null]
    );
  } catch (err) {
    if (err.code !== '23505') throw err;
    return render(res, { errors: [`Den Namen „${f.label}“ gibt es schon.`] });
  }
  await logAction(req.session.admin.id, 'feature', old.id, 'edit_feature', { old: { label: old.label, active: old.active }, new: { label: f.label, active: f.active } });
  res.redirect('/admin/leistungen?ok=Gespeichert');
}));

module.exports = router;
