// Sammelanfrage „Lass dir Camp-Angebote schicken“: Wünsche → passende Anbieter (3 vorgeschlagen + bis zu 2 weitere) →
// Einwilligung mit allen Empfängern namentlich → Bestätigungslink → Admin gibt frei → Weitergabe je Anbieter (camp_leads).
// Reihenfolge der Vorschläge nur nach Passung, nie nach Partnerstatus oder Bezahlung.
const db = require('../db');
const mailer = require('./mailer');
const sites = require('./sites');
const leads = require('./leads');
const { logAction } = require('../lib/audit');
const { newToken, sha256, isEmail, ipHash } = require('../lib/util');

const SUGGEST = 3;
const MAX_PROVIDERS = 5;
const FOCUS = { bike: 'Rad', swim: 'Schwimmen', run: 'Laufen', race: 'Wettkampfvorbereitung' };
const SUPPORT = { coach: 'Coach / Trainingsplan', group: 'Gruppe zum Mittrainieren', orga: 'nur Organisation' };
const YES_NO_ANY = { yes: 'ja', no: 'nein', any: 'egal' };
const EXCLUSIVE = { own: 'eigene Gruppe', open: 'offenes Camp', any: 'egal' };

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const int = (v, min, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= min && n <= max ? n : null; };
const text = (v, max) => String(v || '').trim().replace(/\s+/g, ' ').slice(0, max) || null;
const pick = (v, allowed) => (Object.prototype.hasOwnProperty.call(allowed, v) ? v : null);

// Schritt 1: Wünsche prüfen. regions: Regionen der Site (für das Ziel); hotel: Objekt, wenn von einer Hotelseite
function validateWishes(body, { regions = [], now = new Date() } = {}) {
  const errors = [];
  const months = new Set(leads.months(now).map((m) => m.value));
  const kind = body.kind === 'group' ? 'group' : 'private';
  const w = {
    kind,
    period_month: months.has(body.period_month) ? `${body.period_month}-01` : null,
    period_note: text(body.period_note, 120),
    duration_days: int(body.duration_days, 2, 42),
    destination: regions.some((r) => r.slug === body.destination) ? body.destination : null,
    level: pick(body.level, leads.LEVELS),
    focus: [].concat(body.focus || []).filter((f) => FOCUS[f]).slice(0, 4),
    support: pick(body.support, SUPPORT),
    hotel_wanted: pick(body.hotel_wanted, YES_NO_ANY) || 'any',
    flight_wanted: pick(body.flight_wanted, YES_NO_ANY) || 'any',
    // deutsche Schreibweise: Punkt = Tausender, Komma = Dezimal („1.200 €“ = 1200)
    budget_pp: body.budget_pp !== undefined && String(body.budget_pp).trim() !== '' ? Number(String(body.budget_pp).replace(/[^\d,]/g, '').replace(',', '.')) : null,
    persons: int(body.persons, 1, 80),
    rooms_single: int(body.rooms_single, 0, 40) || 0,
    rooms_double: int(body.rooms_double, 0, 40) || 0,
    message: String(body.message || '').trim().slice(0, 3000) || null,
    club_name: kind === 'group' ? text(body.club_name, 120) : null,
    contact_role: kind === 'group' ? text(body.contact_role, 80) : null,
    level_range: kind === 'group' ? text(body.level_range, 120) : null,
    own_coaches: kind === 'group' ? (body.own_coaches === 'yes' ? true : body.own_coaches === 'no' ? false : null) : null,
    exclusive: kind === 'group' ? pick(body.exclusive, EXCLUSIVE) || 'any' : null,
    invoice_to_club: kind === 'group' ? body.invoice_to_club === 'on' : null,
  };
  if (w.budget_pp !== null && !(w.budget_pp > 0 && w.budget_pp < 100000)) w.budget_pp = null;
  if (!w.period_month && !w.period_note) errors.push('Bitte wähle einen Monat oder beschreib den Zeitraum.');
  if (!w.persons) errors.push('Bitte gib an, wie viele Personen mitkommen.');
  if (w.persons && w.rooms_single + w.rooms_double * 2 > 0 && w.rooms_single + w.rooms_double * 2 < w.persons) {
    errors.push('Die Zimmer reichen nicht für alle Personen (Einzelzimmer = 1, Doppelzimmer = 2 Personen).');
  }
  if (kind === 'group' && !w.club_name) errors.push('Bitte gib den Namen des Vereins bzw. der Gruppe an.');
  return { errors, wishes: w };
}

// Passung eines Anbieters (reine Funktion). Ergebnis: { score, reasons } – score < 0 heißt „passt nicht“
function scoreProvider(p, w, { regionName = null, hotelProviderIds = [], monthNo = null } = {}) {
  let score = 0;
  const reasons = [];
  const f = p.features || {};
  if (hotelProviderIds.includes(p.id)) { score += 6; reasons.push('Camps in diesem Hotel'); }
  if (regionName) {
    const hay = [...(p.regions || []), ...(p.destinations || [])].map(norm);
    if (hay.some((h) => h.includes(norm(regionName)) || norm(regionName).includes(h))) { score += 4; reasons.push(regionName); } else if (!hotelProviderIds.includes(p.id)) return { score: -100, reasons: ['anderes Ziel'] };
  }
  if (monthNo && (p.match_months || []).length) {
    if (p.match_months.includes(monthNo)) { score += 2; reasons.push('Termin im Wunschmonat'); } else score -= 3;
  }
  if (w.level && (p.match_levels || []).length) {
    if (p.match_levels.includes(w.level)) { score += 1; reasons.push(leads.LEVELS[w.level]); } else score -= 2;
  }
  if (w.persons && (p.group_min || p.group_max)) {
    if ((p.group_min && w.persons < p.group_min) || (p.group_max && w.persons > p.group_max)) score -= 3; else score += 1;
  }
  if (w.kind === 'group' && w.exclusive === 'own') {
    if (p.exclusive_groups === true) { score += 2; reasons.push('eigene Vereinscamps'); } else if (p.exclusive_groups === false) score -= 3;
  }
  if (w.support === 'coach' && ['coach', 'operator'].includes(p.model)) score += 1;
  if (w.support === 'orga' && ['operator', 'resort', 'group'].includes(p.model)) score += 1;
  if (w.hotel_wanted === 'yes') { if (['yes', 'partner', 'required'].includes(f.hotel)) score += 1; else if (f.hotel === 'no') score -= 2; }
  if (w.hotel_wanted === 'no' && f.camp_only === true) score += 1;
  if (w.flight_wanted === 'yes') { if (['yes', 'partner'].includes(f.flight)) score += 1; else if (f.flight === 'no') score -= 1; }
  if (w.focus.includes('swim') && f.swim === true) { score += 1; reasons.push('Schwimm-Schwerpunkt'); }
  if (w.level === 'beginner' && f.beginner === true) { score += 1; reasons.push('für Einsteiger'); }
  if (w.budget_pp && p.price_min && Number(p.price_min) > w.budget_pp) score -= 2;
  else if (w.budget_pp && p.price_min) score += 1;
  return { score, reasons };
}

// Anbieter sortiert nach Passung; nur aktive mit Empfängeradresse (Vereinbarung oder Kontakt)
function rankProviders(providers, w, ctx = {}) {
  return providers
    .filter((p) => p.status === 'active' && (p.lead_email || p.contact_email))
    .map((p) => ({ ...p, match: scoreProvider(p, w, ctx) }))
    .filter((p) => p.match.score > -50)
    .sort((a, b) => b.match.score - a.match.score || a.name.localeCompare(b.name, 'de'));
}

const consentText = (names) =>
  `Ich bin einverstanden, dass tri-hotel.de meine Anfrage mit Name, E-Mail-Adresse, Telefon (falls angegeben) und den Angaben oben an folgende Anbieter weitergibt, damit sie mir Angebote schicken können: ${names.join(', ')}. Die Anbieter dürfen mir dazu antworten; eine Buchung ist damit nicht verbunden.`;

async function context(siteId, w, entity = null) {
  const providers = await db.many(`SELECT * FROM camp_providers WHERE site_id = $1 AND status = 'active'`, [siteId]);
  const region = w.destination ? await db.one('SELECT name FROM regions WHERE site_id = $1 AND slug = $2', [siteId, w.destination]) : null;
  const hotelProviderIds = entity ? (await db.many('SELECT DISTINCT provider_id FROM camp_provider_hotels WHERE entity_id = $1', [entity.id])).map((r) => r.provider_id) : [];
  const monthNo = w.period_month ? Number(w.period_month.slice(5, 7)) : null;
  return { providers, ctx: { regionName: region && region.name, hotelProviderIds, monthNo } };
}

// Schritt 2: Auswahl, Kontakt, Einwilligung prüfen
// hotel: Hotel der Hotelseite mit Kontaktadresse – kann zusätzlich (oder allein) angefragt werden (ask_hotel)
function validateSelection(body, ranked, { hotel = null } = {}) {
  const errors = [];
  const askHotel = Boolean(hotel && hotel.contact_email && body.ask_hotel === 'on');
  const ids = [...new Set([].concat(body.providers || []))].filter((id) => ranked.some((p) => p.id === id)).slice(0, MAX_PROVIDERS + 1);
  const contact = {
    name: text(body.name, 80) || '',
    email: String(body.email || '').trim().toLowerCase().slice(0, 200),
    phone: String(body.phone || '').trim().replace(/[^0-9+ ()/-]/g, '').slice(0, 30) || null,
  };
  if (!ids.length && !askHotel) errors.push(hotel && hotel.contact_email ? 'Bitte wähle das Hotel oder mindestens einen Anbieter.' : 'Bitte wähle mindestens einen Anbieter.');
  if (ids.length > MAX_PROVIDERS) errors.push(`Bitte höchstens ${MAX_PROVIDERS} Anbieter wählen.`);
  if (contact.name.length < 2) errors.push('Bitte gib deinen Namen an.');
  if (!isEmail(contact.email)) errors.push('Bitte gib eine gültige E-Mail-Adresse an – wir schicken dir einen Bestätigungslink.');
  if (body.consent !== 'on') errors.push('Bitte bestätige, dass wir deine Anfrage an die gewählten Anbieter weitergeben dürfen.');
  return { errors, ids: ids.slice(0, MAX_PROVIDERS), contact, askHotel };
}

async function create({ site, wishes, contact, chosen, suggested, entity, ip, askHotel = false }) {
  const tok = newToken();
  const toHotel = Boolean(askHotel && entity);
  const recipients = [...(toHotel ? [entity.name] : []), ...chosen.map((p) => p.name)];
  const consent = consentText(recipients);
  const id = await db.tx(async (c) => {
    const row = (await c.query(
      `INSERT INTO camp_requests (site_id, kind, period_month, period_note, duration_days, destination, level, focus, support, hotel_wanted, flight_wanted,
         budget_pp, persons, rooms_single, rooms_double, entity_id, message, club_name, contact_role, level_range, own_coaches, exclusive, invoice_to_club,
         name, email, phone, suggested_ids, provider_ids, verify_token_hash, token_expires_at, consent_text, ip_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,
         now() + make_interval(hours => $30), $31, $32) RETURNING id`,
      [site.id, wishes.kind, wishes.period_month, wishes.period_note, wishes.duration_days, wishes.destination, wishes.level, wishes.focus, wishes.support,
        wishes.hotel_wanted, wishes.flight_wanted, wishes.budget_pp, wishes.persons, wishes.rooms_single, wishes.rooms_double, entity ? entity.id : null,
        wishes.message, wishes.club_name, wishes.contact_role, wishes.level_range, wishes.own_coaches, wishes.exclusive, wishes.invoice_to_club,
        contact.name, contact.email, contact.phone, suggested.map((p) => p.id), chosen.map((p) => p.id), tok.hash, leads.VERIFY_HOURS, consent, ipHash(ip)]
    )).rows[0];
    // je Anbieter ein Lead (Status folgt der Sammelanfrage); Kontakt und Kernangaben wie bei Einzelanfragen
    for (const p of chosen) {
      await c.query(
        `INSERT INTO camp_leads (site_id, provider_id, request_id, entity_id, hotel_text, name, email, phone, period_month, period_note, persons, level, message, consent_text, ip_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [site.id, p.id, row.id, entity ? entity.id : null, entity ? entity.name : null, contact.name, contact.email, contact.phone, wishes.period_month,
          wishes.period_note, wishes.persons, wishes.level, wishes.message, consent, ipHash(ip)]);
    }
    // Anfrage direkt ans Hotel: Lead ohne Camp-Anbieter (Weiterleitung an die Kontaktadresse des Hotels)
    if (toHotel) {
      await c.query(
        `INSERT INTO camp_leads (site_id, provider_id, to_entity, request_id, entity_id, hotel_text, name, email, phone, period_month, period_note, persons, level, message, consent_text, ip_hash)
         VALUES ($1, NULL, true, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [site.id, row.id, entity.id, entity.name, contact.name, contact.email, contact.phone, wishes.period_month,
          wishes.period_note, wishes.persons, wishes.level, wishes.message, consent, ipHash(ip)]);
    }
    return row.id;
  });
  await mailer.send({
    to: contact.email, template: 'request-verify', site,
    data: { name: contact.name, providers: recipients, hours: leads.VERIFY_HOURS, link: `${sites.urlFor(site)}/angebote-bestaetigen/${tok.token}` },
  });
  return id;
}

async function verify(token) {
  const r = await db.one('SELECT * FROM camp_requests WHERE verify_token_hash = $1', [sha256(token)]);
  if (!r) return { status: 'invalid' };
  if (r.status !== 'received') return { status: 'already', request: r };
  if (new Date(r.token_expires_at) < new Date()) return { status: 'expired', request: r };
  await db.tx(async (c) => {
    await c.query(`UPDATE camp_requests SET status = 'confirmed', confirmed_at = now(), verify_token_hash = NULL, updated_at = now() WHERE id = $1`, [r.id]);
    await c.query(`UPDATE camp_leads SET status = 'confirmed', confirmed_at = now(), updated_at = now() WHERE request_id = $1 AND status = 'received'`, [r.id]);
  });
  return { status: 'ok', request: r };
}

// Zeilen für die Weitergabe-Mail (zusätzlich zu den Lead-Angaben)
function detailLines(r) {
  if (!r) return [];
  const rooms = [r.rooms_double ? `${r.rooms_double} Doppelzimmer` : null, r.rooms_single ? `${r.rooms_single} Einzelzimmer` : null].filter(Boolean).join(', ');
  return [
    r.kind === 'group' ? `Gruppe/Verein: ${r.club_name || '–'}${r.contact_role ? ` (Ansprechperson: ${r.contact_role})` : ''}` : null,
    r.duration_days ? `Dauer: ${r.duration_days} Tage` : null,
    rooms ? `Zimmer: ${rooms}` : null,
    (r.focus || []).length ? `Schwerpunkt: ${r.focus.map((f) => FOCUS[f]).join(', ')}` : null,
    r.support ? `Betreuung: ${SUPPORT[r.support]}` : null,
    r.hotel_wanted && r.hotel_wanted !== 'any' ? `Hotel inklusive: ${YES_NO_ANY[r.hotel_wanted]}` : null,
    r.flight_wanted && r.flight_wanted !== 'any' ? `Flug inklusive: ${YES_NO_ANY[r.flight_wanted]}` : null,
    r.budget_pp ? `Budget pro Person: ca. ${Math.round(Number(r.budget_pp))} €` : null,
    r.kind === 'group' && r.level_range ? `Leistungsniveaus: ${r.level_range}` : null,
    r.kind === 'group' && r.own_coaches !== null ? `Eigene Trainer dabei: ${r.own_coaches ? 'ja' : 'nein'}` : null,
    r.kind === 'group' && r.exclusive && r.exclusive !== 'any' ? `Gewünscht: ${EXCLUSIVE[r.exclusive]}` : null,
    r.kind === 'group' && r.invoice_to_club ? 'Rechnung an den Verein' : null,
  ].filter(Boolean);
}

// Admin: alle bestätigten Leads einer Sammelanfrage weiterleiten
async function forwardRequest(id, adminId) {
  const ls = await db.many(`SELECT id FROM camp_leads WHERE request_id = $1 AND status = 'confirmed'`, [id]);
  const errors = [];
  for (const l of ls) {
    try {
      await leads.forward(l.id, adminId);
    } catch (err) {
      errors.push(err.message);
    }
  }
  const left = (await db.one(`SELECT count(*)::int AS n FROM camp_leads WHERE request_id = $1 AND status = 'confirmed'`, [id])).n;
  if (!left) await db.query(`UPDATE camp_requests SET status = 'forwarded', updated_at = now() WHERE id = $1`, [id]);
  await logAction(adminId, 'camp_request', id, 'forward_request', { leads: ls.length, errors });
  return { forwarded: ls.length - errors.length, errors };
}

module.exports = { SUGGEST, MAX_PROVIDERS, FOCUS, SUPPORT, YES_NO_ANY, EXCLUSIVE, validateWishes, scoreProvider, rankProviders, consentText, context, validateSelection, create, verify, detailLines, forwardRequest };
