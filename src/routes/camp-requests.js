// Sammelanfrage „Lass dir Camp-Angebote schicken“ (Schritt 1: Wünsche, Schritt 2: Anbieter wählen + Kontakt + Einwilligung),
// Bestätigungslink und Rückmeldung der Anbieter zum Ergebnis.
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const leads = require('../services/leads');
const requests = require('../services/camp-requests');
const areas = require('../services/areas');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
const BASE = '/trainingscamp/angebote';

// Felder aus Schritt 1, die in Schritt 2 mitgegeben werden (dort erneut geprüft)
const WISH_KEYS = ['kind', 'period_month', 'period_note', 'duration_days', 'destination', 'level', 'focus', 'support', 'hotel_wanted', 'flight_wanted',
  'budget_pp', 'persons', 'rooms_single', 'rooms_double', 'message', 'club_name', 'contact_role', 'level_range', 'own_coaches', 'exclusive', 'invoice_to_club', 'hotel'];
const pickWishes = (body) => Object.fromEntries(WISH_KEYS.filter((k) => body[k] !== undefined).map((k) => [k, body[k]]));

async function hotelFrom(req, slug) {
  if (!slug || !/^[a-z0-9-]{1,120}$/.test(slug) || !req.hostRanking) return null;
  return db.one(`SELECT e.id, e.name, e.slug, e.city, e.contact_email FROM entities e JOIN entity_rankings er ON er.entity_id = e.id
    WHERE e.slug = $1 AND er.ranking_id = $2 AND er.status = 'live'`, [slug, req.hostRanking.id]);
}

function renderStep1(res, req, { form, errors = [], regions, hotel }) {
  res.status(errors.length ? 422 : 200).render('public/camp-request', {
    title: 'Camp-Angebote anfordern', description: 'Beschreib dein Trainingscamp – wir schlagen passende Anbieter vor und leiten deine Anfrage an bis zu fünf weiter. Kostenlos und unverbindlich.',
    noindex: false, step: 1, form, errors, regions, hotel, months: leads.months(), LEVELS: leads.LEVELS, FOCUS: requests.FOCUS, SUPPORT: requests.SUPPORT,
    YES_NO_ANY: requests.YES_NO_ANY, EXCLUSIVE: requests.EXCLUSIVE,
  });
}

router.get(BASE, wrap(async (req, res, next) => {
  if (!req.site) return next();
  const regions = await areas.regions(req.site.id);
  const hotel = await hotelFrom(req, req.query.hotel);
  const form = { kind: req.query.gruppe ? 'group' : 'private', persons: req.query.gruppe ? '8' : '2', hotel: hotel ? hotel.slug : '' };
  renderStep1(res, req, { form, regions, hotel });
}));

// Schritt 1 abschicken → passende Anbieter zeigen (Schritt 2)
router.post(BASE, limiter, wrap(async (req, res, next) => {
  if (!req.site) return next();
  const regions = await areas.regions(req.site.id);
  const hotel = await hotelFrom(req, req.body.hotel);
  const { errors, wishes } = requests.validateWishes(req.body, { regions });
  if (errors.length) return renderStep1(res, req, { form: req.body, errors, regions, hotel });
  const { providers, ctx } = await requests.context(req.site.id, wishes, hotel);
  const ranked = requests.rankProviders(providers, wishes, ctx);
  res.render('public/camp-request', {
    title: 'Passende Camp-Anbieter', noindex: true, step: 2, wishesJson: JSON.stringify(pickWishes(req.body)), wishes, ranked,
    preselected: ranked.slice(0, requests.SUGGEST).map((p) => p.id), MAX: requests.MAX_PROVIDERS, form: { ask_hotel: 'on' }, errors: [], hotel, LEVELS: leads.LEVELS,
  });
}));

// Schritt 2 abschicken → Sammelanfrage anlegen, Bestätigungslink senden
router.post(`${BASE}/senden`, limiter, wrap(async (req, res, next) => {
  if (!req.site) return next();
  if (req.body.company_url) return res.redirect(303, `${BASE}/danke`); // Honeypot
  let raw = {};
  try {
    raw = JSON.parse(String(req.body.wishes || '{}'));
  } catch { raw = {}; }
  const regions = await areas.regions(req.site.id);
  const hotel = await hotelFrom(req, raw.hotel);
  const { errors: wishErrors, wishes } = requests.validateWishes(raw, { regions });
  if (wishErrors.length) return renderStep1(res, req, { form: raw, errors: wishErrors, regions, hotel });
  const { providers, ctx } = await requests.context(req.site.id, wishes, hotel);
  const ranked = requests.rankProviders(providers, wishes, ctx);
  const { errors, ids, contact, askHotel } = requests.validateSelection(req.body, ranked, { hotel });
  if (!errors.length && (await leads.recentCountByIp(req.ip)) >= 5) errors.push('Zu viele Anfragen in kurzer Zeit. Bitte versuch es morgen noch einmal.');
  if (errors.length) {
    return res.status(422).render('public/camp-request', {
      title: 'Passende Camp-Anbieter', noindex: true, step: 2, wishesJson: JSON.stringify(raw), wishes, ranked,
      preselected: [].concat(req.body.providers || []), MAX: requests.MAX_PROVIDERS, form: req.body, errors, hotel, LEVELS: leads.LEVELS,
    });
  }
  // doppelt abgeschickt (gleiche Adresse, kurz hintereinander)? Dann nicht noch einmal anlegen
  const dup = await db.one(`SELECT 1 FROM camp_requests WHERE email = $1 AND created_at > now() - interval '30 minutes'`, [contact.email]);
  if (!dup) {
    const chosen = ids.map((id) => ranked.find((p) => p.id === id));
    await requests.create({ site: req.site, wishes, contact, chosen, suggested: ranked.slice(0, requests.SUGGEST), entity: hotel, ip: req.ip, askHotel });
  }
  res.redirect(303, `${BASE}/danke`);
}));

router.get(`${BASE}/danke`, (req, res) => res.render('public/request-done', { title: 'Anfrage gesendet', noindex: true, status: 'sent', names: [] }));

router.get('/angebote-bestaetigen/:token', wrap(async (req, res) => {
  const r = await requests.verify(req.params.token);
  const names = r.request ? (await db.many('SELECT name FROM camp_providers WHERE id = ANY($1::uuid[]) ORDER BY name', [r.request.provider_ids])).map((p) => p.name) : [];
  res.render('public/request-done', { title: 'Anfrage bestätigt', noindex: true, status: r.status, names });
}));

// Rückmeldung des Anbieters: Link öffnet nur die Seite, gespeichert wird erst mit dem Knopf (Mailscanner öffnen Links automatisch)
router.get('/anbieter-rueckmeldung/:token/:outcome', wrap(async (req, res) => {
  const l = leads.OUTCOMES[req.params.outcome] ? await leads.findByFollowupToken(req.params.token) : null;
  res.render('public/provider-feedback', { title: 'Rückmeldung', noindex: true, lead: l, outcome: req.params.outcome, OUTCOMES: leads.OUTCOMES, saved: false });
}));

router.post('/anbieter-rueckmeldung/:token/:outcome', limiter, wrap(async (req, res) => {
  const l = await leads.recordOutcome(req.params.token, req.params.outcome);
  res.render('public/provider-feedback', { title: 'Danke', noindex: true, lead: l, outcome: l ? l.outcome : req.params.outcome, OUTCOMES: leads.OUTCOMES, saved: Boolean(l) });
}));

module.exports = router;
