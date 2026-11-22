// Ansprechpartner aus Mail-Antworten → Hub (contact.profile, berechtigtes Interesse, keine Werbe-Erlaubnis).
// Antwortet ein Betrieb per E-Mail statt über das Antwortformular, entsteht der Kontakt im Hub trotzdem: jede Mail, die einem
// Objekt oder Camp-Anbieter zugeordnet ist (Antwort auf unsere Mail, Absenderadresse, Domain oder von Hand), meldet ihren
// Absender einmal je Adresse. Läuft nach jedem Postfach-Abruf und holt dabei auch ältere oder später zugeordnete Mails nach.
// Nicht gemeldet: Abwesenheitsnotizen, Unzustellbar-Meldungen, ignorierte Mails, eigene Adressen.
// Der Hinweis bei Erhebung steht in der Datenschutzerklärung (Abschnitt „Ansprechpartner“), verlinkt in jeder unserer Mails.
const db = require('../db');
const config = require('../config');
const sites = require('./sites');
const hubEvents = require('./hub-events');

const NOTICE_VERSION = '2026-11-21';
const notice = (lang) => (lang === 'de'
  ? 'Antwort per E-Mail: Name und Adresse des Absenders speichern wir als Ansprechpartner für das Profil, auch in unserer Kontaktverwaltung. Keine Werbung. Hinweis in der Datenschutzerklärung, verlinkt in jeder unserer Mails.'
  : 'Reply by email: we store the sender\'s name and address as the contact for the profile, including in our contact management. No advertising. Notice in our privacy policy, linked in every email we send.');

// Wörter, an denen ein Sammel-Absender („Arena Info“, „Reservas Hotel X“) zu erkennen ist – dann kein Vor-/Nachname
const ROLE_WORDS = new Set([
  'info', 'information', 'reservas', 'reserva', 'reservations', 'reservation', 'reservierung', 'reservierungen', 'booking', 'bookings',
  'sales', 'reception', 'recepcion', 'recepción', 'rezeption', 'frontdesk', 'front', 'desk', 'team', 'office', 'contact', 'kontakt',
  'admin', 'service', 'marketing', 'mail', 'hotel', 'resort', 'spa', 'club', 'hello', 'hallo', 'events', 'groups', 'gruppen', 'support',
]);

const lower = (v) => String(v || '').trim().toLowerCase();
const domainOf = (email) => lower(email).split('@')[1] || '';

// Anzeigename → Person für den Hub. Ohne brauchbaren Namen trägt der Kontakt den Namen des Betriebs (fallbackName).
function personName(fromName, fromEmail, fallbackName) {
  let name = String(fromName || '').replace(/["'`<>]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name || name.includes('@') || lower(name) === lower(fromEmail).split('@')[0]) name = '';
  if (!name) return { firstName: null, lastName: String(fallbackName || '').trim().slice(0, 100) || null };
  // „Nachname, Vorname“
  const comma = name.match(/^([^,]+),\s*([^,]+)$/);
  if (comma) name = `${comma[2]} ${comma[1]}`;
  const words = name.split(' ');
  const isPerson = words.length >= 2 && words.length <= 4 && !words.some((w) => ROLE_WORDS.has(lower(w)) || /\d/.test(w));
  if (!isPerson) return { firstName: null, lastName: name.slice(0, 100) };
  return { firstName: words.slice(0, -1).join(' ').slice(0, 100), lastName: words[words.length - 1].slice(0, 100) };
}

// Eigene Adressen (Sites, Personas, Absender) nie als Ansprechpartner melden
async function ownDomains() {
  const out = new Set();
  for (const s of await sites.all()) {
    [s.primary_domain, ...(s.domains || [])].forEach((d) => d && out.add(lower(d).replace(/^www\./, '')));
  }
  for (const p of await db.many('SELECT email FROM personas WHERE email IS NOT NULL')) out.add(domainOf(p.email));
  const from = String((config.mail && config.mail.from) || '').match(/@([^>\s]+)/);
  if (from) out.add(lower(from[1]));
  out.delete('');
  return out;
}

// Reine Entscheidung je Mail: null = melden, sonst Grund fürs Auslassen
function skipReason(m, { own, known }) {
  if (m.kind !== 'mail') return m.kind;
  if (m.status === 'ignored') return 'ignored';
  if (!m.entity_id && !m.camp_provider_id) return 'unassigned';
  const email = lower(m.from_email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return 'invalid';
  if (own.has(domainOf(email))) return 'own';
  if (known.has(email)) return 'known';
  return null;
}

async function siteFor(m) {
  if (m.ranking_site_id) return sites.get(m.ranking_site_id);
  if (m.persona_site_id) return sites.get(m.persona_site_id);
  return sites.getDefault();
}

const CANDIDATES = `
  SELECT m.id, m.from_email, m.from_name, m.kind, m.status, m.entity_id, m.camp_provider_id, m.inquiry_id, m.sent_at, m.received_at,
         e.name AS entity_name, cp.name AS provider_name, i.language, r.site_id AS ranking_site_id, p.site_id AS persona_site_id
    FROM mail_messages m
    LEFT JOIN entities e ON e.id = m.entity_id
    LEFT JOIN camp_providers cp ON cp.id = m.camp_provider_id
    LEFT JOIN inquiries i ON i.id = m.inquiry_id
    LEFT JOIN rankings r ON r.id = i.ranking_id
    LEFT JOIN personas p ON p.id = m.persona_id
   WHERE m.hub_contact_at IS NULL AND (m.entity_id IS NOT NULL OR m.camp_provider_id IS NOT NULL OR m.kind <> 'mail' OR m.status = 'ignored')
   ORDER BY m.received_at
   LIMIT $1`;

// Adressen, die der Hub schon kennt: aus früheren Mails gemeldet oder im Antwortformular angegeben (contact.profile von dort)
async function knownAddresses() {
  const rows = await db.many(
    `SELECT lower(from_email) AS email FROM mail_messages WHERE hub_contact = 'sent'
     UNION SELECT lower(reply_email) FROM inquiries WHERE status = 'answered' AND reply_email IS NOT NULL AND reply_name IS NOT NULL`);
  return new Set(rows.map((r) => r.email));
}

// Nach dem Postfach-Abruf: offene Mails prüfen, je neue Adresse ein contact.profile einstellen
async function report({ limit = 200 } = {}) {
  const rows = await db.many(CANDIDATES, [limit]);
  if (!rows.length) return { sent: 0, skipped: 0 };
  const own = await ownDomains();
  const known = await knownAddresses();
  const r = { sent: 0, skipped: 0 };
  for (const m of rows) {
    let result = skipReason(m, { own, known });
    if (!result) {
      const subject = m.entity_id ? { id: m.entity_id, name: m.entity_name } : { kind: 'camp_provider', id: m.camp_provider_id, name: m.provider_name };
      const site = await siteFor(m);
      const lang = m.language || 'de';
      let event = null;
      try {
        event = hubEvents.contactProfile({
          inquiry: m.inquiry_id ? { id: m.inquiry_id } : null, entity: subject, site, collectedAt: m.received_at,
          person: { ...personName(m.from_name, m.from_email, subject.name), email: lower(m.from_email), language: m.language || null },
          notice: { text: notice(lang), version: NOTICE_VERSION, url: `${sites.urlFor(site)}${lang === 'de' ? '/datenschutz' : '/privacy'}` },
        });
      } catch (err) {
        result = `error: ${err.message}`.slice(0, 200);
      }
      if (event) {
        // Speicherfehler: offen lassen, der nächste Abruf versucht es erneut
        if (!await hubEvents.emit(event)) continue;
        result = 'sent';
        known.add(lower(m.from_email));
      }
    }
    await db.query('UPDATE mail_messages SET hub_contact_at = now(), hub_contact = $2 WHERE id = $1', [m.id, result]);
    if (result === 'sent') r.sent += 1;
    else r.skipped += 1;
  }
  return r;
}

module.exports = { report, personName, skipReason, NOTICE_VERSION, ROLE_WORDS };
