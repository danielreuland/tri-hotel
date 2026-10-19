// Baustein B: Anfragen an Camp-Anbieter. Ablauf: Formular (nur bei Anbietern mit Vereinbarung) → Bestätigungslink
// an den Interessenten → Freigabe im Admin → Weitergabe per Mail an genau diesen Anbieter (Antwort geht direkt an den Interessenten).
// Abgerechnet wird je weitergeleiteter Anfrage zu den Konditionen, die bei der Weitergabe galten.
const db = require('../db');
const mailer = require('./mailer');
const sites = require('./sites');
const { logAction } = require('../lib/audit');
const { newToken, sha256, isEmail, ipHash } = require('../lib/util');

const VERIFY_HOURS = 72;
const LEVELS = { beginner: 'Einsteiger', intermediate: 'Fortgeschritten', ambitious: 'Ambitioniert / Langdistanz' };
const MODELS = { per_lead: 'Vergütung je Anfrage', commission: 'Provision je Buchung', free: 'ohne Vergütung (Test)' };
const STATUS = { received: 'E-Mail unbestätigt', confirmed: 'bestätigt – wartet auf Weitergabe', forwarded: 'weitergeleitet', rejected: 'abgelehnt' };
const consentText = (provider) =>
  `Ich bin einverstanden, dass tri-hotel.de meine Anfrage mit Name, E-Mail-Adresse, Telefon (falls angegeben) und den Angaben oben an ${provider.name} weitergibt, damit mir der Anbieter ein Angebot schicken kann. Der Anbieter darf mir dazu antworten; eine Buchung ist damit nicht verbunden.`;

// Monate für die Auswahl: aktueller bis 18 Monate voraus
function months(now = new Date()) {
  const out = [];
  for (let i = 0; i < 18; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    out.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }) });
  }
  return out;
}

function validate(body, provider, hotels, now = new Date()) {
  const errors = [];
  const allowed = new Set(months(now).map((m) => m.value));
  const month = allowed.has(body.period_month) ? `${body.period_month}-01` : null;
  const persons = Math.round(Number(body.persons));
  const hotel = hotels.find((h) => h.entity_id && h.entity_id === body.entity_id);
  const data = {
    name: String(body.name || '').trim().replace(/\s+/g, ' ').slice(0, 80),
    email: String(body.email || '').trim().toLowerCase().slice(0, 200),
    phone: String(body.phone || '').trim().replace(/[^0-9+ ()/-]/g, '').slice(0, 30) || null,
    period_month: month,
    period_note: String(body.period_note || '').trim().slice(0, 120) || null,
    persons: persons >= 1 && persons <= 30 ? persons : null,
    level: LEVELS[body.level] ? body.level : null,
    entity_id: hotel ? hotel.entity_id : null,
    hotel_text: hotel ? hotel.entity_name || hotel.hotel_name : String(body.hotel_text || '').trim().slice(0, 120) || null,
    message: String(body.message || '').trim().slice(0, 3000) || null,
  };
  if (data.name.length < 2) errors.push('Bitte gib deinen Namen an.');
  if (!isEmail(data.email)) errors.push('Bitte gib eine gültige E-Mail-Adresse an – wir schicken dir einen Bestätigungslink.');
  if (!data.period_month && !data.period_note) errors.push('Bitte wähle einen Monat oder beschreib den Zeitraum.');
  if (!data.persons) errors.push('Bitte gib an, wie viele Personen mitkommen (1–30).');
  if (body.consent !== 'on') errors.push(`Bitte bestätige, dass wir deine Anfrage an ${provider.name} weitergeben dürfen.`);
  return { errors, data };
}

async function create({ provider, site, data, ip }) {
  const tok = newToken();
  const row = await db.one(
    `INSERT INTO camp_leads (site_id, provider_id, entity_id, hotel_text, name, email, phone, period_month, period_note, persons, level, message,
       verify_token_hash, token_expires_at, consent_text, ip_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now() + make_interval(hours => $14), $15, $16) RETURNING id`,
    [site.id, provider.id, data.entity_id, data.hotel_text, data.name, data.email, data.phone, data.period_month, data.period_note, data.persons,
      data.level, data.message, tok.hash, VERIFY_HOURS, consentText(provider), ipHash(ip)]);
  await mailer.send({
    to: data.email, template: 'lead-verify', site,
    data: { entityName: provider.name, name: data.name, hours: VERIFY_HOURS, link: `${sites.urlFor(site)}/anfrage-bestaetigen/${tok.token}` },
  });
  return row.id;
}

async function recentCountByIp(ip) {
  return (await db.one(`SELECT count(*)::int AS n FROM camp_leads WHERE ip_hash = $1 AND created_at > now() - interval '1 day'`, [ipHash(ip)])).n;
}

// Doppelt abgeschickt? Gleiche Adresse, gleicher Anbieter, kurz hintereinander
async function isDuplicate(providerId, email) {
  return Boolean(await db.one(`SELECT 1 FROM camp_leads WHERE provider_id = $1 AND email = $2 AND created_at > now() - interval '30 minutes'`, [providerId, email]));
}

async function verify(token) {
  const l = await db.one('SELECT * FROM camp_leads WHERE verify_token_hash = $1', [sha256(token)]);
  if (!l) return { status: 'invalid' };
  if (l.status !== 'received') return { status: 'already', lead: l };
  if (new Date(l.token_expires_at) < new Date()) return { status: 'expired', lead: l };
  await db.query(`UPDATE camp_leads SET status = 'confirmed', confirmed_at = now(), verify_token_hash = NULL, updated_at = now() WHERE id = $1`, [l.id]);
  return { status: 'ok', lead: l };
}

async function load(id) {
  return db.one(
    `SELECT l.*, p.name AS provider_name, p.lead_email, p.lead_model, p.lead_fee, p.lead_active, p.site_id AS provider_site, e.name AS entity_name
       FROM camp_leads l JOIN camp_providers p ON p.id = l.provider_id LEFT JOIN entities e ON e.id = l.entity_id WHERE l.id = $1`, [id]);
}

// Admin: E-Mail ohne Bestätigung als geprüft behandeln (z. B. Anfrage per Telefon nachgefragt)
async function verifyByAdmin(id, adminId) {
  const r = await db.query(`UPDATE camp_leads SET status = 'confirmed', verified_by = $2, verify_token_hash = NULL, updated_at = now() WHERE id = $1 AND status = 'received'`, [id, adminId]);
  if (r.rowCount) await logAction(adminId, 'camp_lead', id, 'verify_lead_by_admin');
}

// Weitergabe an den Anbieter: Mail mit allen Angaben, Antwort direkt an den Interessenten; Konditionen festhalten
async function forward(id, adminId) {
  const l = await load(id);
  if (!l || l.status !== 'confirmed') throw new Error('Nur bestätigte Anfragen können weitergeleitet werden.');
  if (!l.lead_email) throw new Error('Für diesen Anbieter ist keine Empfänger-Adresse für Anfragen hinterlegt.');
  const site = await db.one('SELECT * FROM sites WHERE id = $1', [l.site_id]);
  const sent = await mailer.send({
    to: l.lead_email, template: 'lead-forward', site, replyTo: l.email, campProviderId: l.provider_id,
    data: { entityName: l.provider_name, lead: l, levelLabel: LEVELS[l.level] || null },
  });
  if (!sent) throw new Error('Mailversand fehlgeschlagen – Anfrage bleibt offen.');
  await db.query(
    `UPDATE camp_leads SET status = 'forwarded', forwarded_at = now(), forwarded_by = $2, billed_model = $3, billed_fee = $4, updated_at = now() WHERE id = $1`,
    [id, adminId, l.lead_model, l.lead_model === 'per_lead' ? l.lead_fee : null]);
  await logAction(adminId, 'camp_lead', id, 'forward_lead', { provider: l.provider_name, model: l.lead_model, fee: l.lead_fee });
}

async function reject(id, adminId, reason) {
  await db.query(`UPDATE camp_leads SET status = 'rejected', rejection_reason = $2, updated_at = now() WHERE id = $1 AND status IN ('received', 'confirmed')`, [id, reason || null]);
  await logAction(adminId, 'camp_lead', id, 'reject_lead', { reason: reason || null });
}

// Abrechnung je Monat und Anbieter (weitergeleitete Anfragen)
async function billing(siteId, monthsBack = 6) {
  return db.many(
    `SELECT date_trunc('month', l.forwarded_at)::date AS month, p.name AS provider, l.billed_model AS model,
            count(*)::int AS leads, COALESCE(sum(l.billed_fee), 0)::numeric(10,2) AS amount
       FROM camp_leads l JOIN camp_providers p ON p.id = l.provider_id
      WHERE l.site_id = $1 AND l.status = 'forwarded' AND l.forwarded_at > date_trunc('month', now()) - make_interval(months => $2)
      GROUP BY 1, 2, 3 ORDER BY 1 DESC, 2`, [siteId, monthsBack]);
}

module.exports = { VERIFY_HOURS, LEVELS, MODELS, STATUS, consentText, months, validate, create, recentCountByIp, isDuplicate, verify, load, verifyByAdmin, forward, reject, billing };
