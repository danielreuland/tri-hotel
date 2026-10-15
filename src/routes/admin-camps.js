// Camp-Anbieter pflegen: Stammdaten, Merkmale, Preisbeispiele, Hotels, Partnerstatus; Klickzahlen der Weiterleitung.
const express = require('express');
const db = require('../db');
const camps = require('../services/camps');
const { requireAdmin } = require('../middleware/context');
const { logAction } = require('../lib/audit');
const { slugify, normalizeUrl } = require('../lib/util');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.use(requireAdmin);
router.param('id', (req, res, next, v) => (UUID_RE.test(v) ? next() : next('route')));

const TRI = (v) => (v === 'yes' ? true : v === 'no' ? false : null);
const lines = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean);

// Preise: eine Zeile je Beispiel „Bezeichnung | Dauer | Preis | enthalten | nicht enthalten“
// Hotels: eine Zeile je Hotel „Name | Ort | Region“
function readForm(b) {
  const errors = [];
  const f = {
    name: String(b.name || '').trim().slice(0, 120),
    slug: slugify(b.slug || b.name),
    model: camps.MODELS[b.model] ? b.model : 'coach',
    model_label: String(b.model_label || '').trim().slice(0, 120) || null,
    seat: String(b.seat || '').trim().slice(0, 120) || null,
    summary: String(b.summary || '').trim().slice(0, 1500) || null,
    website: normalizeUrl(b.website),
    destinations: String(b.destinations || '').split(',').map((x) => x.trim()).filter(Boolean),
    regions: String(b.regions || '').split(',').map((x) => x.trim()).filter(Boolean),
    features: {
      hotel: camps.HOTEL_VALUES[b.f_hotel] ? b.f_hotel : 'unknown', hotel_note: String(b.f_hotel_note || '').trim() || undefined,
      flight: camps.FLIGHT_VALUES[b.f_flight] ? b.f_flight : 'unknown', flight_note: String(b.f_flight_note || '').trim() || undefined,
      camp_only: TRI(b.f_camp_only), beginner: TRI(b.f_beginner), women: TRI(b.f_women), swim: TRI(b.f_swim), family: TRI(b.f_family),
      family_note: String(b.f_family_note || '').trim() || undefined, max_group: String(b.f_max_group || '').trim() || undefined,
    },
    prices: lines(b.prices).map((l) => { const [label, duration, price, included, excluded] = l.split('|').map((x) => (x || '').trim()); return { label, duration, price, included, excluded }; }),
    hotels: lines(b.hotels).map((l) => { const [hotel_name, place, region] = l.split('|').map((x) => (x || '').trim()); return { hotel_name, place, region }; }),
    as_of: /^\d{4}-\d{2}-\d{2}$/.test(b.as_of || '') ? b.as_of : null,
    source_url: normalizeUrl(b.source_url),
    partner: b.partner === 'on',
    partner_url: normalizeUrl(b.partner_url, { keepTracking: true }),
    status: ['draft', 'active', 'archived'].includes(b.status) ? b.status : 'draft',
  };
  if (!f.name || !f.slug) errors.push('Name ist Pflicht.');
  if (!f.website) errors.push('Website ist Pflicht (https://…).');
  if (f.partner && !f.partner_url) errors.push('Für Partner bitte den Partner-Link angeben.');
  return { f, errors };
}

async function siteId() {
  return (await db.one(`SELECT id FROM sites ORDER BY is_default DESC LIMIT 1`)).id;
}

router.get('/', wrap(async (req, res) => {
  const sid = await siteId();
  const rows = await db.many(
    `SELECT p.*, (SELECT count(*)::int FROM camp_provider_hotels h WHERE h.provider_id = p.id) AS hotels,
            (SELECT count(*)::int FROM camp_provider_hotels h WHERE h.provider_id = p.id AND h.entity_id IS NOT NULL) AS linked
       FROM camp_providers p WHERE p.site_id = $1 ORDER BY p.status, lower(p.name)`, [sid]);
  res.render('admin/camps', { title: 'Camp-Anbieter', rows, stats: await camps.clickStats(sid), MODELS: camps.MODELS, flash: req.query.ok || null });
}));

async function renderForm(res, p, extra = {}) {
  const hotelsText = (p.hotels || []).map((h) => [h.hotel_name, h.place, h.region].filter((x) => x !== undefined).join(' | ')).join('\n');
  const pricesText = (p.prices || []).map((x) => [x.label, x.duration, x.price, x.included, x.excluded].join(' | ')).join('\n');
  res.render('admin/camp-form', { title: p.id ? `Anbieter: ${p.name}` : 'Neuer Anbieter', p, hotelsText, pricesText, MODELS: camps.MODELS, HOTEL_VALUES: camps.HOTEL_VALUES, FLIGHT_VALUES: camps.FLIGHT_VALUES, errors: [], ...extra });
}

router.get('/neu', wrap(async (req, res) => renderForm(res, { status: 'draft', features: {}, prices: [], hotels: [], destinations: [], regions: [] })));

router.get('/:id', wrap(async (req, res, next) => {
  const p = await db.one('SELECT * FROM camp_providers WHERE id = $1', [req.params.id]);
  if (!p) return next();
  p.hotels = await db.many('SELECT * FROM camp_provider_hotels WHERE provider_id = $1 ORDER BY sort_order', [p.id]);
  await renderForm(res, p);
}));

router.post('/:id?', wrap(async (req, res) => {
  const { f, errors } = readForm(req.body);
  if (errors.length) return renderForm(res, { ...f, id: req.params.id }, { errors });
  const sid = await siteId();
  try {
    const id = await db.tx(async (c) => {
      const vals = [f.slug, f.name, f.model, f.model_label, f.seat, f.summary, f.website, f.destinations, f.regions, JSON.stringify(f.features),
        JSON.stringify(f.prices), f.as_of, f.source_url, f.partner, f.partner_url, f.status];
      let pid = req.params.id;
      if (pid) {
        await c.query(`UPDATE camp_providers SET slug=$2, name=$3, model=$4, model_label=$5, seat=$6, summary=$7, website=$8, destinations=$9, regions=$10,
          features=$11, prices=$12, as_of=$13, source_url=$14, partner=$15, partner_url=$16, status=$17, updated_at=now() WHERE id=$1`, [pid, ...vals]);
      } else {
        pid = (await c.query(`INSERT INTO camp_providers (site_id, slug, name, model, model_label, seat, summary, website, destinations, regions, features, prices, as_of, source_url, partner, partner_url, status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`, [sid, ...vals])).rows[0].id;
      }
      // Hotels neu schreiben; Verknüpfung über gleichen Namen (ohne „Hotel“, Akzente egal, nur eindeutig) (bestehende Verknüpfungen bleiben erhalten)
      const old = await c.query('SELECT hotel_name, entity_id FROM camp_provider_hotels WHERE provider_id = $1', [pid]);
      const keep = new Map(old.rows.filter((r) => r.entity_id).map((r) => [r.hotel_name, r.entity_id]));
      await c.query('DELETE FROM camp_provider_hotels WHERE provider_id = $1', [pid]);
      let i = 0;
      for (const h of f.hotels) {
        if (!h.hotel_name) continue;
        const match = keep.get(h.hotel_name) || (await camps.matchEntity(h.hotel_name, c));
        await c.query('INSERT INTO camp_provider_hotels (provider_id, entity_id, hotel_name, place, region, sort_order) VALUES ($1,$2,$3,$4,$5,$6)',
          [pid, match, h.hotel_name, h.place || null, h.region || null, i++]);
      }
      await logAction(req.session.admin.id, 'camp_provider', pid, req.params.id ? 'edit_camp_provider' : 'create_camp_provider', { name: f.name, partner: f.partner, status: f.status }, c);
      return pid;
    });
    res.redirect(`/admin/camps/${id}?ok=Gespeichert`);
  } catch (err) {
    if (err.code === '23505') return renderForm(res, { ...f, id: req.params.id }, { errors: ['Der Slug ist schon vergeben.'] });
    throw err;
  }
}));

module.exports = router;
