// Admin: Partnerprogramme (Kennung bzw. Netzwerk-Vorlage, Status) und Klickübersicht.
const express = require('express');
const db = require('../db');
const partners = require('../services/partners');
const { logAction } = require('../lib/audit');
const { requireAdmin } = require('../middleware/context');

const router = express.Router();
router.use(requireAdmin);
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// „aid=123456“ je Zeile -> { aid: '123456' }
function parseParams(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_.-]{1,40})\s*=\s*(\S{1,200})\s*$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

router.get('/', wrap(async (req, res) => {
  const days = [7, 30, 90, 365].includes(Number(req.query.tage)) ? Number(req.query.tage) : 30;
  res.render('admin/partners', {
    title: 'Partnerprogramme', programs: await partners.programs(), stats: await partners.stats(days), days,
    monetized: partners.monetized, flash: req.query.ok || null, error: req.query.fehler || null,
  });
}));

router.post('/:id', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const old = await db.one('SELECT * FROM partner_programs WHERE id = $1', [req.params.id]);
  if (!old) return next();
  const b = req.body;
  const template = String(b.link_template || '').trim() || null;
  if (template && (!/^https:\/\//.test(template) || !/\{url(_enc)?\}/.test(template))) {
    return res.redirect(`/admin/partner?fehler=${encodeURIComponent('Deeplink-Vorlage: https-Adresse mit {url} oder {url_enc}.')}`);
  }
  const upd = {
    name: String(b.name || old.name).trim().slice(0, 80),
    link_params: parseParams(b.link_params),
    link_template: template,
    label_booking: String(b.label_booking || old.label_booking).trim().slice(0, 80),
    label_reviews: String(b.label_reviews || old.label_reviews).trim().slice(0, 80),
    status: b.status === 'active' ? 'active' : 'inactive',
    notes: String(b.notes || '').trim().slice(0, 1000) || null,
  };
  await db.query(
    `UPDATE partner_programs SET name=$2, link_params=$3, link_template=$4, label_booking=$5, label_reviews=$6, status=$7, notes=$8, updated_at=now() WHERE id=$1`,
    [old.id, upd.name, JSON.stringify(upd.link_params), upd.link_template, upd.label_booking, upd.label_reviews, upd.status, upd.notes]);
  await logAction(req.session.admin.id, 'partner_program', old.id, 'edit_partner_program', {
    status: { old: old.status, new: upd.status }, params: Object.keys(upd.link_params), template: Boolean(upd.link_template),
  });
  res.redirect(`/admin/partner?ok=${encodeURIComponent(`${upd.name} gespeichert`)}`);
}));

module.exports = router;
