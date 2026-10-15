// Admin: Camp-Anfragen (Baustein B) – prüfen, an den Anbieter weiterleiten, ablehnen; Abrechnung je Monat.
const express = require('express');
const db = require('../db');
const leads = require('../services/leads');
const { requireAdmin } = require('../middleware/context');

const router = express.Router();
router.use(requireAdmin);
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILTERS = { offen: ['received', 'confirmed'], forwarded: ['forwarded'], rejected: ['rejected'], alle: ['received', 'confirmed', 'forwarded', 'rejected'] };

router.get('/', wrap(async (req, res) => {
  const filter = FILTERS[req.query.status] ? req.query.status : 'offen';
  const site = await db.one('SELECT id FROM sites ORDER BY is_default DESC LIMIT 1');
  const rows = await db.many(
    `SELECT l.*, p.name AS provider_name, p.slug AS provider_slug, p.lead_email, p.lead_model, p.lead_fee, e.name AS entity_name
       FROM camp_leads l JOIN camp_providers p ON p.id = l.provider_id LEFT JOIN entities e ON e.id = l.entity_id
      WHERE l.status = ANY($1::text[]) ORDER BY (l.status = 'confirmed') DESC, l.created_at DESC LIMIT 200`, [FILTERS[filter]]);
  const counts = Object.fromEntries((await db.many(`SELECT status, count(*)::int AS n FROM camp_leads GROUP BY status`)).map((r) => [r.status, r.n]));
  const active = await db.many(`SELECT name, slug, lead_model, lead_fee, lead_commission, lead_email FROM camp_providers WHERE lead_active ORDER BY lower(name)`);
  res.render('admin/leads', {
    title: 'Camp-Anfragen', rows, filter, counts, active, billing: await leads.billing(site.id), STATUS: leads.STATUS, LEVELS: leads.LEVELS, MODELS: leads.MODELS,
    flash: req.query.ok || null, error: req.query.fehler || null,
  });
}));

router.post('/:id/aktion', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const back = `/admin/camp-anfragen?status=${encodeURIComponent(req.body.status || 'offen')}`;
  const adminId = req.session.admin.id;
  try {
    if (req.body.action === 'verify') await leads.verifyByAdmin(req.params.id, adminId);
    else if (req.body.action === 'forward') await leads.forward(req.params.id, adminId);
    else if (req.body.action === 'reject') await leads.reject(req.params.id, adminId, String(req.body.reason || '').trim().slice(0, 300));
    else return next();
  } catch (err) {
    return res.redirect(`${back}&fehler=${encodeURIComponent(err.message)}#l-${req.params.id}`);
  }
  const msg = { verify: 'Als bestätigt markiert', forward: 'An den Anbieter weitergeleitet', reject: 'Abgelehnt' }[req.body.action];
  res.redirect(`${back}&ok=${encodeURIComponent(msg)}#l-${req.params.id}`);
}));

module.exports = router;
