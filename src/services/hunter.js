// Hunter.io (Domain Search) als dritte Quelle für die Kontaktadresse – nach Website und OpenStreetMap.
// Nur allgemeine Firmenadressen (type=generic, z. B. info@, reservas@), nie persönliche. Ergebnis ist immer ein
// Vorschlag mit Fundstelle (Seite, auf der Hunter die Adresse gefunden hat); übernommen wird erst durch den Admin.
// Monatsgrenze: HUNTER_MONTHLY_LIMIT Abfragen je Kalendermonat (gezählt in api_usage, auch Abfragen ohne Treffer).
const db = require('../db');
const config = require('../config');
const { websiteKey } = require('../lib/util');

const ENDPOINT = 'https://api.hunter.io/v2/domain-search';

// Bevorzugte Postfächer (je früher, desto besser) und solche, die für Anfragen nicht taugen
const PREFERRED = ['reservations', 'reservation', 'reservas', 'reserva', 'reservierung', 'booking', 'bookings', 'info', 'hotel',
  'kontakt', 'contact', 'office', 'reception', 'recepcion', 'rezeption', 'welcome', 'hello', 'hallo', 'sales', 'groups', 'gruppen', 'mail'];
const EXCLUDED = /^(no-?reply|donotreply|privacy|datenschutz|dpo|gdpr|rgpd|abuse|postmaster|webmaster|hostmaster|jobs?|careers?|karriere|empleo|bewerbung|hr|rrhh|press|presse|prensa|newsletter|invoices?|rechnung|facturas?|billing|accounting|buchhaltung|unsubscribe|security|legal)\b/i;

const enabled = () => Boolean(config.hunter.apiKey);

// Beste allgemeine Adresse der Domain mit Fundstelle wählen (reine Funktion, getestet)
function pick(emails, domain) {
  const d = String(domain || '').toLowerCase();
  const sameDomain = (addr) => { const host = addr.split('@')[1] || ''; return host === d || host.endsWith(`.${d}`); };
  const rank = (local) => {
    const i = PREFERRED.findIndex((p) => local === p || local.startsWith(`${p}.`) || local.startsWith(`${p}-`) || local.startsWith(`${p}_`));
    return i < 0 ? PREFERRED.length : i;
  };
  const candidates = (emails || [])
    .filter((e) => e && e.type === 'generic' && typeof e.value === 'string' && /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e.value))
    .map((e) => ({ ...e, value: e.value.toLowerCase() }))
    .filter((e) => sameDomain(e.value) && !EXCLUDED.test(e.value.split('@')[0]))
    .map((e) => {
      const sources = (e.sources || []).filter((s) => s && /^https?:\/\//.test(s.uri || ''));
      const source = sources.find((s) => s.still_on_page) || sources[0];
      return source ? { email: e.value, confidence: Number(e.confidence) || 0, evidenceUrl: source.uri, stillOnPage: Boolean(source.still_on_page), rank: rank(e.value.split('@')[0]) } : null;
    })
    .filter(Boolean);
  candidates.sort((a, b) => a.rank - b.rank || Number(b.stillOnPage) - Number(a.stillOnPage) || b.confidence - a.confidence);
  if (!candidates.length) return null;
  const { rank: _r, ...best } = candidates[0];
  return best;
}

async function monthUsed() {
  const { n } = await db.one(`SELECT count(*)::int AS n FROM api_usage WHERE service = 'hunter' AND created_at >= date_trunc('month', now())`);
  return n;
}

async function quota() {
  const used = await monthUsed();
  return { used, limit: config.hunter.monthlyLimit, left: Math.max(0, config.hunter.monthlyLimit - used) };
}

// Domain Search für eine Website. Ergebnis: { suggestion: {email, confidence, evidenceUrl, stillOnPage} | null, reason }
async function findGenericEmail(website, { entityId = null, campProviderId = null } = {}) {
  if (!enabled()) return { suggestion: null, reason: 'Hunter.io ist nicht eingerichtet (HUNTER_API_KEY).' };
  const domain = website ? websiteKey(website) : null;
  if (!domain) return { suggestion: null, reason: 'Keine Website – Hunter braucht eine Domain.' };
  const q = await quota();
  if (!q.left) return { suggestion: null, reason: `Monatsgrenze erreicht (${q.used} von ${q.limit} Abfragen).` };
  const params = new URLSearchParams({ domain, type: 'generic', limit: '10', api_key: config.hunter.apiKey });
  let data = null;
  let ok = true;
  try {
    const res = await fetch(`${ENDPOINT}?${params}`, { signal: AbortSignal.timeout(15000) });
    data = await res.json().catch(() => ({}));
    if (!res.ok) {
      ok = false;
      const msg = (data.errors && data.errors[0] && (data.errors[0].details || data.errors[0].id)) || res.status;
      return { suggestion: null, reason: `Hunter.io: ${msg}` };
    }
  } catch (err) {
    ok = false;
    return { suggestion: null, reason: `Hunter.io nicht erreichbar: ${err.message}` };
  } finally {
    const emails = (data && data.data && data.data.emails) || [];
    await db.query(
      `INSERT INTO api_usage (service, purpose, entity_id, camp_provider_id, query, results, ok) VALUES ('hunter', 'contact_email', $1, $2, $3, $4, $5)`,
      [entityId, campProviderId, domain, emails.length, ok]
    );
  }
  const suggestion = pick(data.data && data.data.emails, domain);
  return { suggestion, reason: suggestion ? null : 'Keine allgemeine Adresse mit Fundstelle gefunden.' };
}

module.exports = { enabled, pick, quota, findGenericEmail, PREFERRED };
