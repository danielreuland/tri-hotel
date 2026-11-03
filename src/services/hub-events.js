// Ereignisse tri-hotel → Hub danielreuland.com (Vertrag: docs/internal-api.md, Richtung B).
// Ablauf: emit() speichert das Ereignis in hub_events und stellt einen pg-boss-Job ein; deliver() sendet es signiert
// (HMAC + Nonce) an HUB_EVENTS_URL. Der Hub verarbeitet idempotent per Ereignis-ID, Wiederholungen sind also unschädlich.
// Ohne Ziel (HUB_EVENTS_URL/HUB_EVENTS_SECRET leer) wird nur protokolliert. Fehler hier brechen nie den Auslöser ab.
// Neutralität: reine Meldung an den Hub – nichts kommt zurück, nichts wirkt auf Score oder Reihenfolge.
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const auth = require('../lib/internal-auth');

const APP = 'tri-hotel';
const VERSION = 1;
const MAX_ATTEMPTS = 10;
const TIMEOUT_MS = 5000;
const TYPES = ['inquiry.sent', 'inquiry.answered', 'contact.profile', 'contact.consent', 'photos.permission'];
// pg-boss: 9 Wiederholungen mit wachsendem Abstand ab 2 min (2, 4, 8 … 512 min) ≈ 17 h
const JOB_OPTIONS = { retryLimit: MAX_ATTEMPTS - 1, retryDelay: 120, retryBackoff: true };

let enqueue = async () => {};
function setEnqueue(fn) {
  enqueue = fn;
}

const iso = (d) => (d ? new Date(d).toISOString() : null);
const str = (v, max = 200) => {
  const s = String(v === undefined || v === null ? '' : v).trim().slice(0, max);
  return s || null;
};

// --- Ereignisse bauen (reine Funktionen) --------------------------------------------------------------------------
// Hülle wie im Vertrag: { id, type, version, occurredAt, site, subject: { kind, id, name }, data }

const SUBJECT_KINDS = ['entity', 'camp_provider'];

// subject: Objekt (entities-Zeile) oder { kind: 'camp_provider', id, name }
function subjectOf(entity) {
  if (!entity) return null;
  const kind = entity.kind || 'entity';
  if (!SUBJECT_KINDS.includes(kind)) throw new Error(`Unbekannte subject-Art „${kind}“`);
  return { kind, id: entity.id, name: entity.name };
}

function envelope({ type, site, entity, data, id = crypto.randomUUID(), occurredAt = new Date() }) {
  if (!TYPES.includes(type)) throw new Error(`Unbekannter Ereignistyp „${type}“`);
  const subject = subjectOf(entity);
  if (!subject || !subject.id || !subject.name) throw new Error('Ereignis braucht ein subject (id, name)');
  return { id, type, version: VERSION, occurredAt: iso(occurredAt), site: site ? site.primary_domain : null, subject, data };
}

// Faktenanfrage versendet – ohne Empfängeradresse und Mailtext
function inquirySent({ inquiry, entity, site, ranking }) {
  return envelope({
    type: 'inquiry.sent', site, entity, occurredAt: inquiry.sent_at || new Date(),
    data: {
      inquiryId: inquiry.id, purpose: 'facts', ranking: ranking ? ranking.code : null, language: inquiry.language,
      sentAt: iso(inquiry.sent_at), expiresAt: iso(inquiry.expires_at), askPhotos: Boolean(inquiry.ask_photos),
      questions: Array.isArray(inquiry.criteria_ids) ? inquiry.criteria_ids.length : 0,
    },
  });
}

// Antwortformular abgeschickt – nur Zahlen und Einwilligungstypen, kein Name (der kommt nur über contact.profile)
// answeredFields = alle Angaben, confirmed = bekannte Werte bestätigt/korrigiert (Anzahl > 0)
function inquiryAnswered({ inquiry, entity, site, ranking, answers = 0, confirmed = 0, photos = 0, consents = [] }) {
  return envelope({
    type: 'inquiry.answered', site, entity, occurredAt: inquiry.answered_at || new Date(),
    data: {
      inquiryId: inquiry.id, ranking: ranking ? ranking.code : null, answeredAt: iso(inquiry.answered_at || new Date()),
      answeredFields: Number(answers) || 0, confirmed: Number(confirmed) > 0, photos: Number(photos) || 0, consents: [...consents],
    },
  });
}

const SALUTATIONS = ['herr', 'frau', 'neutral'];

function personOut(p = {}) {
  const out = {};
  for (const f of ['salutation', 'firstName', 'lastName', 'position', 'email', 'phone', 'language']) out[f] = str(p[f], f === 'email' ? 254 : 200);
  if (out.email) out.email = out.email.toLowerCase();
  if (out.salutation && !SALUTATIONS.includes(out.salutation.toLowerCase())) out.salutation = null;
  else if (out.salutation) out.salutation = out.salutation.toLowerCase();
  if (!out.lastName) throw new Error('person braucht einen Nachnamen');
  if (!out.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(out.email)) throw new Error('person braucht eine gültige E-Mail-Adresse');
  return out;
}

// Ansprechpartner fürs Profil (ab Paket P2). Rechtsgrundlage berechtigtes Interesse – keine Werbe-Einwilligung.
// notice = Datenschutzhinweis bei der Erhebung (Art. 14): { text, version, url }
function contactProfile({ inquiry = null, entity, site, person, notice, collectedAt = new Date() }) {
  if (!notice || !notice.version) throw new Error('contact.profile braucht die Version des Datenschutzhinweises');
  return envelope({
    type: 'contact.profile', site, entity, occurredAt: collectedAt,
    data: {
      inquiryId: inquiry ? inquiry.id : null, person: personOut(person), legalBasis: 'legitimate_interest',
      notice: { text: str(notice.text, 2000), version: notice.version, url: str(notice.url, 500) },
    },
  });
}

// E-Mail-Einwilligung (Kontakt zu Kooperationen, ab P2). Erst nach Double-Opt-in senden (confirmedAt Pflicht).
// Widerrufe sind in v1 kein Ereignis (Hub verarbeitet nur erteilte Einwilligungen) – Daniel trägt sie im Hub ein.
function contactConsent({
  inquiry = null, entity, site, person, project = 'tri-hotel', purpose, text, textVersion, language = null,
  givenAt, doubleOptInSentAt = null, doubleOptInConfirmedAt = null,
}) {
  if (!text || !textVersion) throw new Error('contact.consent braucht Wortlaut und Version (Nachweis)');
  if (!givenAt) throw new Error('contact.consent braucht den Zeitpunkt der Einwilligung');
  if (!doubleOptInConfirmedAt) throw new Error('contact.consent erst nach Double-Opt-in senden');
  return envelope({
    type: 'contact.consent', site, entity, occurredAt: doubleOptInConfirmedAt,
    data: {
      inquiryId: inquiry ? inquiry.id : null, project, person: personOut(person),
      consent: {
        channel: 'email', purpose: str(purpose, 500), text, textVersion, language,
        givenAt: iso(givenAt), doubleOptIn: { sentAt: iso(doubleOptInSentAt), confirmedAt: iso(doubleOptInConfirmedAt) },
      },
    },
  });
}

const PHOTO_SCOPES = { photos_profile: 'profile', photos_social: 'social' };
const SCOPE_TEXT = { profile: 'Profil', social: 'Social Media' };

// Nutzungserlaubnis für Fotos erteilt (granted) oder abgelehnt/widerrufen. scopes: ['profile', 'social'] oder Einwilligungstypen
function photosPermission({
  inquiry = null, entity, site, scopes = [], granted = true, photos = 0, credit = null, textVersion, grantedAt = null, withdrawnAt = null,
}) {
  const sc = [...new Set(scopes.map((x) => PHOTO_SCOPES[x] || x))];
  if (sc.some((x) => !SCOPE_TEXT[x]) || (granted && !sc.length)) throw new Error('photos.permission: scopes nur profile/social');
  if (!textVersion) throw new Error('photos.permission braucht die Version des Wortlauts');
  return envelope({
    type: 'photos.permission', site, entity, occurredAt: granted ? grantedAt || new Date() : withdrawnAt || new Date(),
    data: {
      inquiryId: inquiry ? inquiry.id : null, granted: Boolean(granted), count: Number(photos) || 0,
      scope: sc.length ? `Fotos mit Urhebervermerk: ${sc.map((x) => SCOPE_TEXT[x]).join(' und ')}${site ? ` (${site.primary_domain})` : ''}` : null,
      scopes: sc, credit: str(credit), textVersion, grantedAt: iso(grantedAt), withdrawnAt: iso(withdrawnAt),
    },
  });
}

// --- Speichern und Zustellen --------------------------------------------------------------------------------------

// Speichert ein Ereignis und stellt es zur Zustellung ein. Gibt die ID zurück, bei Fehlern null (nie eine Ausnahme).
async function emit(event, { client = db } = {}) {
  try {
    await client.query(
      `INSERT INTO hub_events (id, type, entity_id, payload) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
      [event.id, event.type, event.subject.kind === 'entity' ? event.subject.id : null, JSON.stringify(event)]);
    await enqueue('hub-event', { eventId: event.id }, JOB_OPTIONS);
    return event.id;
  } catch (err) {
    console.error('[hub-events] Ereignis nicht gespeichert', event && event.type, err.message);
    return null;
  }
}

// Ereignis nachträglich bauen und senden, ohne den Auslöser zu stören (Bau-Fehler werden nur protokolliert)
async function emitSafe(build, args) {
  try {
    return await emit(build(args));
  } catch (err) {
    console.error('[hub-events]', err.message);
    return null;
  }
}

// 2xx = angenommen (auch Duplikat); 408/409 (Nonce schon gesehen)/429/5xx/Netzfehler = später erneut mit neuer Nonce;
// sonst (400 Form, 401/404 Zugang) endgültig abgelehnt
const retriable = (status) => status === null || [408, 409, 429].includes(status) || status >= 500;

async function post(url, secret, body, { fetchFn = fetch, now = Date.now() } = {}) {
  const u = new URL(url);
  const headers = auth.headers({ app: APP, secret, method: 'POST', path: `${u.pathname}${u.search}`, body, nonce: crypto.randomUUID(), now });
  try {
    const res = await fetchFn(url, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error',
    });
    return { status: res.status };
  } catch (err) {
    return { status: null, error: err.message };
  }
}

async function finish(id, status, error = null) {
  await db.query(
    `UPDATE hub_events SET status = $2, payload = NULL, last_error = $3, sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END,
            updated_at = now() WHERE id = $1`, [id, status, error]);
}

// Job-Ausführung. Wirft bei vorübergehenden Fehlern, damit pg-boss mit Abstand wiederholt.
async function deliver(eventId, { target = config.hubEvents, fetchFn = fetch } = {}) {
  const row = await db.one(`SELECT id, type, payload, status, attempts FROM hub_events WHERE id = $1`, [eventId]);
  if (!row || row.status !== 'pending' || !row.payload) return { status: row ? row.status : 'missing' };
  if (!target || !target.url || !target.secret) {
    console.log(`[hub-events] kein Ziel (HUB_EVENTS_URL/HUB_EVENTS_SECRET) – ${row.type} ${row.id} nur protokolliert`);
    await finish(row.id, 'skipped');
    return { status: 'skipped' };
  }
  const body = JSON.stringify(row.payload);
  const r = await post(target.url, target.secret, body, { fetchFn });
  const attempts = row.attempts + 1;
  if (r.status !== null && r.status >= 200 && r.status < 300) {
    await db.query(`UPDATE hub_events SET attempts = $2 WHERE id = $1`, [row.id, attempts]);
    await finish(row.id, 'sent');
    return { status: 'sent' };
  }
  const error = r.status === null ? `Netzwerk: ${r.error}` : `HTTP ${r.status}`;
  if (!retriable(r.status) || attempts >= MAX_ATTEMPTS) {
    // 401/404: Schlüssel oder Ziel falsch eingerichtet – im Log deutlich machen
    const hint = r.status === 401 || r.status === 404 ? ' – HUB_EVENTS_URL/HUB_EVENTS_SECRET prüfen' : '';
    console.error(`[hub-events] ${row.type} ${row.id} endgültig nicht zugestellt (${error}, Versuch ${attempts})${hint}`);
    await db.query(`UPDATE hub_events SET attempts = $2 WHERE id = $1`, [row.id, attempts]);
    await finish(row.id, 'failed', error);
    return { status: 'failed' };
  }
  await db.query(`UPDATE hub_events SET attempts = $2, last_error = $3, updated_at = now() WHERE id = $1`, [row.id, attempts, error]);
  throw new Error(`Hub-Ereignis ${row.id}: ${error} – neuer Versuch folgt`);
}

// Täglich: hängengebliebene Ereignisse (z. B. Job ging beim Neustart verloren) erneut einstellen,
// erledigte nach 90 Tagen löschen
async function maintenance({ keepDays = 90 } = {}) {
  const stuck = await db.many(
    `SELECT id FROM hub_events WHERE status = 'pending' AND updated_at < now() - interval '1 day' AND attempts < $1`, [MAX_ATTEMPTS]);
  for (const r of stuck) await enqueue('hub-event', { eventId: r.id }, JOB_OPTIONS);
  await db.query(
    `UPDATE hub_events SET status = 'failed', payload = NULL, updated_at = now() WHERE status = 'pending' AND attempts >= $1`, [MAX_ATTEMPTS]);
  const removed = await db.query(`DELETE FROM hub_events WHERE status <> 'pending' AND created_at < now() - make_interval(days => $1)`, [keepDays]);
  return { requeued: stuck.length, removed: removed.rowCount };
}

module.exports = {
  TYPES, MAX_ATTEMPTS, JOB_OPTIONS, setEnqueue,
  envelope, inquirySent, inquiryAnswered, contactProfile, contactConsent, photosPermission,
  emit, emitSafe, post, retriable, deliver, maintenance,
};
