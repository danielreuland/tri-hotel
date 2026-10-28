// Camp-Anbieter pflegen: Stammdaten, Merkmale, Preisbeispiele, Hotels, Partnerstatus; Klickzahlen der Weiterleitung.
const express = require('express');
const db = require('../db');
const camps = require('../services/camps');
const campCheck = require('../services/camp-check');
const { requireAdmin } = require('../middleware/context');
const { logAction } = require('../lib/audit');
const { slugify, normalizeUrl } = require('../lib/util');

const { isEmail } = require('../lib/util');
const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.use(requireAdmin);
router.param('id', (req, res, next, v) => (UUID_RE.test(v) ? next() : next('route')));

const TRI = (v) => (v === 'yes' ? true : v === 'no' ? false : null);
const lines = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean);

// Preise: eine Zeile je Beispiel „Bezeichnung | Dauer | Preis | enthalten | nicht enthalten“
// Hotels: Objekte aus dem Ranking per Auswahl (hotel_entities), dazu freie Zeilen „Name | Ort | Region“ für Hotels
// außerhalb des Rankings; angehakte Vorschläge (adopt = „Name::Objekt-ID“) machen aus einer freien Zeile eine Verknüpfung
function readForm(b) {
  const adopt = new Map([].concat(b.adopt || []).map((v) => String(v).split('::')).filter((p) => p.length === 2 && UUID_RE.test(p[1])));
  const free = lines(b.hotels).map((l) => { const [hotel_name, place, region] = l.split('|').map((x) => (x || '').trim()); return { hotel_name, place, region }; });
  const entityIds = [...new Set([...[].concat(b.hotel_entities || []).filter((v) => UUID_RE.test(v)), ...free.filter((h) => adopt.has(h.hotel_name)).map((h) => adopt.get(h.hotel_name))])];
  const errors = [];
  const f = {
    name: String(b.name || '').trim().slice(0, 120),
    slug: slugify(b.slug || b.name),
    model: camps.MODELS[b.model] ? b.model : 'coach',
    model_label: String(b.model_label || '').trim().slice(0, 120) || null,
    seat: String(b.seat || '').trim().slice(0, 120) || null,
    summary: String(b.summary || '').trim().slice(0, 1500) || null,
    website: normalizeUrl(b.website),
    contact_email: String(b.contact_email || '').trim().toLowerCase().slice(0, 200) || null,
    contact_phone: String(b.contact_phone || '').trim().slice(0, 60) || null,
    // Abgleich für Sammelanfragen (leer = keine Einschränkung)
    match_months: [].concat(b.match_months || []).map(Number).filter((m) => m >= 1 && m <= 12),
    match_levels: [].concat(b.match_levels || []).filter((l) => ['beginner', 'intermediate', 'ambitious'].includes(l)),
    group_min: Number(b.group_min) >= 1 ? Math.round(Number(b.group_min)) : null,
    group_max: Number(b.group_max) >= 1 ? Math.round(Number(b.group_max)) : null,
    exclusive_groups: b.exclusive_groups === 'yes' ? true : b.exclusive_groups === 'no' ? false : null,
    price_min: Number(String(b.price_min || '').replace(',', '.')) > 0 ? Number(String(b.price_min).replace(',', '.')) : null,
    price_max: Number(String(b.price_max || '').replace(',', '.')) > 0 ? Number(String(b.price_max).replace(',', '.')) : null,
    destinations: String(b.destinations || '').split(',').map((x) => x.trim()).filter(Boolean),
    regions: String(b.regions || '').split(',').map((x) => x.trim()).filter(Boolean),
    features: {
      hotel: camps.HOTEL_VALUES[b.f_hotel] ? b.f_hotel : 'unknown', hotel_note: String(b.f_hotel_note || '').trim() || undefined,
      flight: camps.FLIGHT_VALUES[b.f_flight] ? b.f_flight : 'unknown', flight_note: String(b.f_flight_note || '').trim() || undefined,
      camp_only: TRI(b.f_camp_only), beginner: TRI(b.f_beginner), women: TRI(b.f_women), swim: TRI(b.f_swim), family: TRI(b.f_family),
      family_note: String(b.f_family_note || '').trim() || undefined, max_group: String(b.f_max_group || '').trim() || undefined,
    },
    prices: lines(b.prices).map((l) => { const [label, duration, price, included, excluded] = l.split('|').map((x) => (x || '').trim()); return { label, duration, price, included, excluded }; }),
    entityIds,
    free: free.filter((h) => h.hotel_name && !adopt.has(h.hotel_name)),
    as_of: /^\d{4}-\d{2}-\d{2}$/.test(b.as_of || '') ? b.as_of : null,
    source_url: normalizeUrl(b.source_url),
    partner: b.partner === 'on',
    partner_url: normalizeUrl(b.partner_url, { keepTracking: true }),
    status: ['draft', 'active', 'rejected', 'archived'].includes(b.status) ? b.status : 'draft',
    // Vereinbarung für Anfragen (Baustein B)
    lead_active: b.lead_active === 'on',
    lead_email: String(b.lead_email || '').trim().toLowerCase().slice(0, 200) || null,
    lead_model: ['per_lead', 'commission', 'free'].includes(b.lead_model) ? b.lead_model : null,
    lead_fee: b.lead_fee !== undefined && String(b.lead_fee).trim() !== '' ? Number(String(b.lead_fee).replace(',', '.')) : null,
    lead_commission: b.lead_commission !== undefined && String(b.lead_commission).trim() !== '' ? Number(String(b.lead_commission).replace(',', '.')) : null,
    lead_since: /^\d{4}-\d{2}-\d{2}$/.test(b.lead_since || '') ? b.lead_since : null,
    lead_notes: String(b.lead_notes || '').trim().slice(0, 2000) || null,
  };
  if (!f.name || !f.slug) errors.push('Name ist Pflicht.');
  if (!f.website) errors.push('Website ist Pflicht (https://…).');
  if (f.contact_email && !isEmail(f.contact_email)) errors.push('Kontakt-E-Mail ist ungültig.');
  if (f.partner && !f.partner_url && !f.lead_active) errors.push('Für Partner bitte den Partner-Link angeben oder Anfragen aktivieren.');
  if (f.lead_active && !isEmail(f.lead_email || '')) errors.push('Für Anfragen bitte eine gültige Empfänger-Adresse angeben.');
  if (f.lead_active && !f.lead_model) errors.push('Für Anfragen bitte das Vergütungsmodell wählen.');
  if (f.lead_model === 'per_lead' && !(f.lead_fee >= 0)) errors.push('Vergütung je Anfrage in Euro angeben.');
  if (f.lead_fee !== null && !Number.isFinite(f.lead_fee)) errors.push('Vergütung je Anfrage: bitte eine Zahl.');
  if (f.lead_commission !== null && !Number.isFinite(f.lead_commission)) errors.push('Provision: bitte eine Zahl in Prozent.');
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
  res.render('admin/camps', { title: 'Camp-Anbieter', rows, stats: await camps.clickStats(sid), MODELS: camps.MODELS, flash: req.query.ok || null,
    indexable: camps.indexable, minProfileWords: camps.MIN_PROFILE_WORDS });
}));

async function renderForm(res, p, extra = {}) {
  // Verknüpfte Objekte in die Auswahl, freie Zeilen ins Textfeld (mit Vorschlag, falls ein Objekt im Ranking passt)
  const options = await camps.entityOptions(await siteId());
  const selectedIds = p.entityIds || (p.hotels || []).filter((h) => h.entity_id).map((h) => h.entity_id);
  const freeRows = p.free || (p.hotels || []).filter((h) => !h.entity_id);
  const hotelsText = freeRows.map((h) => [h.hotel_name, h.place, h.region].filter((x) => x !== undefined && x !== null).join(' | ')).join('\n');
  const suggestions = freeRows.map((h) => ({ row: h, hit: camps.suggestEntity(h, options.filter((o) => !selectedIds.includes(o.id))) })).filter((x) => x.hit);
  const pricesText = (p.prices || []).map((x) => [x.label, x.duration, x.price, x.included, x.excluded].join(' | ')).join('\n');
  res.render('admin/camp-form', { title: p.id ? `Anbieter: ${p.name}` : 'Neuer Anbieter', p, hotelsText, entityOptions: options, selectedIds, suggestions, pricesText, MODELS: camps.MODELS, HOTEL_VALUES: camps.HOTEL_VALUES, FLIGHT_VALUES: camps.FLIGHT_VALUES,
    QUALIFICATION: campCheck.QUALIFICATION, profileWords: camps.profileWords, minProfileWords: camps.MIN_PROFILE_WORDS, errors: [], flash: null, flashError: null, pendingHotels: [], ...extra });
}

// Neu: nur Name + Website, dann automatische Prüfung (Entwurf, öffentlich erst nach Freigabe)
router.get('/neu', (req, res) => res.render('admin/camp-new', { title: 'Camp-Anbieter anlegen', form: {}, errors: [] }));

router.post('/anlegen', wrap(async (req, res) => {
  const form = { name: String(req.body.name || '').trim().slice(0, 120), website: normalizeUrl(req.body.website) };
  const errors = [];
  if (!form.name) errors.push('Name ist Pflicht.');
  if (!form.website) errors.push('Gültige Website angeben (https://…).');
  const sid = await siteId();
  if (!errors.length) {
    // gleiche Domain schon vorhanden?
    const { websiteKey } = require('../lib/util');
    const key = websiteKey(form.website);
    const dup = (await db.many('SELECT id, name, website FROM camp_providers WHERE site_id = $1', [sid])).find((p) => websiteKey(p.website) === key);
    if (dup) errors.push(`Diese Website gehört schon zu „${dup.name}“.`);
  }
  if (errors.length) return res.render('admin/camp-new', { title: 'Camp-Anbieter anlegen', form, errors });
  let slug = slugify(form.name);
  for (let i = 2; await db.one('SELECT 1 FROM camp_providers WHERE site_id = $1 AND slug = $2', [sid, slug]); i++) slug = `${slugify(form.name)}-${i}`;
  const row = await db.one(
    `INSERT INTO camp_providers (site_id, slug, name, model, website, status, created_by) VALUES ($1, $2, $3, 'coach', $4, 'draft', $5) RETURNING id`,
    [sid, slug, form.name, form.website, req.session.admin.id]);
  await logAction(req.session.admin.id, 'camp_provider', row.id, 'create_camp_provider', { name: form.name, website: form.website });
  await campCheck.queue(row.id);
  res.redirect(`/admin/camps/${row.id}?ok=${encodeURIComponent('Angelegt – die automatische Prüfung läuft (etwa 1–2 Minuten).')}`);
}));

// Alle Anbieter (in Prüfung oder freigegeben) erneut automatisch prüfen – nacheinander im Hintergrund
router.post('/alle-pruefen', wrap(async (req, res) => {
  const sid = await siteId();
  const rows = await db.many(`SELECT id FROM camp_providers WHERE site_id = $1 AND status IN ('draft', 'active') AND COALESCE(check_status, '') NOT IN ('queued', 'running')`, [sid]);
  for (const r of rows) await campCheck.queue(r.id);
  await logAction(req.session.admin.id, 'site', sid, 'requeue_all_camp_checks', { count: rows.length });
  res.redirect(`/admin/camps?ok=${encodeURIComponent(`${rows.length} Anbieter werden geprüft – die Ampeln erscheinen nach und nach.`)}`);
}));

// Hunter-Vorschlag aus dem Prüfbericht als Kontakt-E-Mail übernehmen
router.post('/:id/kontakt-vorschlag', wrap(async (req, res) => {
  const p = await db.one('SELECT id, contact_email, check_report FROM camp_providers WHERE id = $1', [req.params.id]);
  const s = p && ((p.check_report || {}).hunter || {}).suggestion;
  if (s) {
    await db.query(`UPDATE camp_providers SET contact_email = $2, contact_source = 'hunter', contact_evidence = $3 WHERE id = $1`, [p.id, s.email, s.evidenceUrl]);
    await logAction(req.session.admin.id, 'camp_provider', p.id, 'accept_contact_suggestion', { email: s.email, previous: p.contact_email || null });
    await campCheck.requalify(p.id);
  }
  res.redirect(`/admin/camps/${req.params.id}?ok=${encodeURIComponent(s ? `Kontakt-E-Mail ${s.email} übernommen` : 'Kein Vorschlag vorhanden')}`);
}));

// Prüfung erneut starten, Freigeben, Ablehnen
router.post('/:id/pruefen', wrap(async (req, res) => {
  await campCheck.queue(req.params.id);
  await logAction(req.session.admin.id, 'camp_provider', req.params.id, 'requeue_camp_check');
  res.redirect(`/admin/camps/${req.params.id}?ok=${encodeURIComponent('Prüfung gestartet.')}`);
}));

router.post('/:id/freigeben', wrap(async (req, res) => {
  const p = await db.one(
    `UPDATE camp_providers SET status = 'active', reject_reason = NULL, reviewed_by = $2, reviewed_at = now(), updated_at = now()
      WHERE id = $1 AND status IN ('draft', 'rejected') RETURNING name, qualification`, [req.params.id, req.session.admin.id]);
  if (p) await logAction(req.session.admin.id, 'camp_provider', req.params.id, 'approve_camp_provider', { qualification: p.qualification });
  res.redirect(`/admin/camps/${req.params.id}?ok=${encodeURIComponent(p ? 'Freigegeben – der Anbieter ist öffentlich.' : 'Keine Änderung')}`);
}));

router.post('/:id/ablehnen', wrap(async (req, res) => {
  const reason = String(req.body.reason || '').trim().slice(0, 1000);
  if (!reason) return res.redirect(`/admin/camps/${req.params.id}?fehler=${encodeURIComponent('Bitte eine Begründung angeben.')}`);
  await db.query(
    `UPDATE camp_providers SET status = 'rejected', reject_reason = $3, reviewed_by = $2, reviewed_at = now(), updated_at = now() WHERE id = $1`,
    [req.params.id, req.session.admin.id, reason]);
  await logAction(req.session.admin.id, 'camp_provider', req.params.id, 'reject_camp_provider', { reason });
  res.redirect(`/admin/camps/${req.params.id}?ok=${encodeURIComponent('Abgelehnt.')}`);
}));

router.get('/:id', wrap(async (req, res, next) => {
  const p = await db.one('SELECT * FROM camp_providers WHERE id = $1', [req.params.id]);
  if (!p) return next();
  p.hotels = await db.many('SELECT * FROM camp_provider_hotels WHERE provider_id = $1 ORDER BY sort_order', [p.id]);
  // Hotel-Meldungen aus der Prüfung mit aktuellem Stand
  const pendingHotels = await db.many(
    `SELECT h.hotel_name, h.place, s.id AS submission_id, s.status, s.website FROM camp_provider_hotels h JOIN submissions s ON s.id = h.submission_id
      WHERE h.provider_id = $1 AND h.entity_id IS NULL ORDER BY h.sort_order`, [p.id]);
  await renderForm(res, p, { flash: req.query.ok || null, flashError: req.query.fehler || null, pendingHotels });
}));

router.post('/:id?', wrap(async (req, res) => {
  const { f, errors } = readForm(req.body);
  if (errors.length) return renderForm(res, { ...f, id: req.params.id }, { errors });
  const sid = await siteId();
  try {
    const id = await db.tx(async (c) => {
      const vals = [f.slug, f.name, f.model, f.model_label, f.seat, f.summary, f.website, f.destinations, f.regions, JSON.stringify(f.features),
        JSON.stringify(f.prices), f.as_of, f.source_url, f.partner, f.partner_url, f.status,
        f.lead_active, f.lead_email, f.lead_model, f.lead_fee, f.lead_commission, f.lead_since, f.lead_notes];
      let pid = req.params.id;
      if (pid) {
        await c.query(`UPDATE camp_providers SET slug=$2, name=$3, model=$4, model_label=$5, seat=$6, summary=$7, website=$8, destinations=$9, regions=$10,
          features=$11, prices=$12, as_of=$13, source_url=$14, partner=$15, partner_url=$16, status=$17,
          lead_active=$18, lead_email=$19, lead_model=$20, lead_fee=$21, lead_commission=$22, lead_since=$23, lead_notes=$24, updated_at=now() WHERE id=$1`, [pid, ...vals]);
      } else {
        pid = (await c.query(`INSERT INTO camp_providers (site_id, slug, name, model, model_label, seat, summary, website, destinations, regions, features, prices, as_of, source_url, partner, partner_url, status,
            lead_active, lead_email, lead_model, lead_fee, lead_commission, lead_since, lead_notes)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) RETURNING id`, [sid, ...vals])).rows[0].id;
      }
      // Hotels: Auswahl aus dem Ranking + freie Zeilen; nichts wird über den Namen automatisch verknüpft
      const hotels = await camps.saveProviderHotels(c, pid, { entityIds: f.entityIds, free: f.free });
      await c.query(
        `UPDATE camp_providers SET match_months = $2, match_levels = $3, group_min = $4, group_max = $5, exclusive_groups = $6, price_min = $7, price_max = $8 WHERE id = $1`,
        [pid, f.match_months, f.match_levels, f.group_min, f.group_max, f.exclusive_groups, f.price_min, f.price_max]);
      // Kontakt: geänderte Werte gelten als vom Admin eingetragen
      await c.query(
        `UPDATE camp_providers SET
           contact_source = CASE WHEN contact_email IS DISTINCT FROM $2 OR contact_phone IS DISTINCT FROM $3 THEN CASE WHEN $2::text IS NULL AND $3::text IS NULL THEN NULL ELSE 'admin' END ELSE contact_source END,
           contact_evidence = CASE WHEN contact_email IS DISTINCT FROM $2 OR contact_phone IS DISTINCT FROM $3 THEN NULL ELSE contact_evidence END,
           contact_email = $2, contact_phone = $3 WHERE id = $1`,
        [pid, f.contact_email, f.contact_phone]);
      await logAction(req.session.admin.id, 'camp_provider', pid, req.params.id ? 'edit_camp_provider' : 'create_camp_provider', { name: f.name, partner: f.partner, status: f.status, lead_active: f.lead_active, lead_model: f.lead_model, lead_fee: f.lead_fee, hotels }, c);
      return pid;
    });
    // Ampel neu bewerten (z. B. Kontakt jetzt eingetragen) – ohne neue Prüfung
    await campCheck.requalify(id);
    res.redirect(`/admin/camps/${id}?ok=Gespeichert`);
  } catch (err) {
    if (err.code === '23505') return renderForm(res, { ...f, id: req.params.id }, { errors: ['Der Slug ist schon vergeben.'] });
    throw err;
  }
}));

module.exports = router;
