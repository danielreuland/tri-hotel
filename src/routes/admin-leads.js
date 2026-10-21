// Admin: Camp-Anfragen (Baustein B) – prüfen, an den Anbieter weiterleiten, ablehnen; Abrechnung je Monat.
const express = require('express');
const db = require('../db');
const leads = require('../services/leads');
const requests = require('../services/camp-requests');
const { logAction } = require('../lib/audit');
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
    `SELECT l.*, p.name AS provider_name, p.slug AS provider_slug, p.lead_email, p.lead_active, p.contact_email AS provider_contact_email, p.lead_model, p.lead_fee,
            e.name AS entity_name, r.kind AS req_kind, r.club_name AS req_club, r.rooms_single AS req_single, r.rooms_double AS req_double,
            cardinality(r.provider_ids) AS req_providers, r.status AS req_status
       FROM camp_leads l JOIN camp_providers p ON p.id = l.provider_id LEFT JOIN entities e ON e.id = l.entity_id LEFT JOIN camp_requests r ON r.id = l.request_id
      WHERE l.status = ANY($1::text[]) ORDER BY (l.status = 'confirmed') DESC, l.created_at DESC, l.request_id, p.name LIMIT 300`, [FILTERS[filter]]);
  const counts = Object.fromEntries((await db.many(`SELECT status, count(*)::int AS n FROM camp_leads GROUP BY status`)).map((r) => [r.status, r.n]));
  const active = await db.many(`SELECT name, slug, lead_model, lead_fee, lead_commission, lead_email FROM camp_providers WHERE lead_active ORDER BY lower(name)`);
  res.render('admin/leads', {
    title: 'Camp-Anfragen', rows, filter, counts, active, billing: await leads.billing(site.id), STATUS: leads.STATUS, LEVELS: leads.LEVELS, MODELS: leads.MODELS, OUTCOMES: leads.OUTCOMES,
    flash: req.query.ok || null, error: req.query.fehler || null,
  });
}));

router.post('/:id/aktion', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const back = `/admin/camp-anfragen?status=${encodeURIComponent(req.body.status || 'offen')}`;
  const adminId = req.session.admin.id;
  try {
    const lead = await db.one('SELECT request_id FROM camp_leads WHERE id = $1', [req.params.id]);
    if (req.body.action === 'verify' && lead && lead.request_id) {
      // Sammelanfrage: gilt für alle Anbieter der Anfrage
      await db.query(`UPDATE camp_requests SET status = 'confirmed', confirmed_at = now(), verify_token_hash = NULL, updated_at = now() WHERE id = $1 AND status = 'received'`, [lead.request_id]);
      await db.query(`UPDATE camp_leads SET status = 'confirmed', verified_by = $2, updated_at = now() WHERE request_id = $1 AND status = 'received'`, [lead.request_id, adminId]);
      await logAction(adminId, 'camp_request', lead.request_id, 'verify_request_by_admin');
    } else if (req.body.action === 'verify') await leads.verifyByAdmin(req.params.id, adminId);
    else if (req.body.action === 'forward') await leads.forward(req.params.id, adminId);
    else if (req.body.action === 'forward_all' && lead && lead.request_id) {
      const r = await requests.forwardRequest(lead.request_id, adminId);
      if (r.errors.length) throw new Error(`${r.forwarded} weitergeleitet, offen: ${r.errors.join(' · ')}`);
    }
    else if (req.body.action === 'reject') await leads.reject(req.params.id, adminId, String(req.body.reason || '').trim().slice(0, 300));
    else return next();
  } catch (err) {
    return res.redirect(`${back}&fehler=${encodeURIComponent(err.message)}#l-${req.params.id}`);
  }
  const msg = { verify: 'Als bestätigt markiert', forward: 'An den Anbieter weitergeleitet', forward_all: 'An alle gewählten Anbieter weitergeleitet', reject: 'Abgelehnt' }[req.body.action];
  res.redirect(`${back}&ok=${encodeURIComponent(msg)}#l-${req.params.id}`);
}));

module.exports = router;
