const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db');
const hub = require('../src/services/hub-events');
const auth = require('../src/lib/internal-auth');
const { shapeErrors } = require('./helpers/shape');

const fx = (name) => require(`../docs/internal-api/fixtures/events/${name}.json`);
const site = { primary_domain: 'tri-hotel.de' };
const entity = { id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', name: 'Club La Santa', entity_type: 'hotel' };
const ranking = { code: 'triathlon-hotel' };
const inquiry = {
  id: 'b1a2c3d4-e5f6-4789-8abc-def012345678', language: 'es', ask_photos: true, criteria_ids: ['a', 'b', 'c', 'd'],
  sent_at: new Date('2026-10-20T09:15:00Z'), expires_at: new Date('2026-11-19T09:15:00Z'), answered_at: new Date('2026-10-22T17:40:00Z'),
  recipient: 'info@clublasanta.com', reply_name: 'Ana Beispiel', body: 'Mailtext',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const person = { salutation: 'Frau', firstName: 'Ana', lastName: 'Beispiel', position: 'Sales Manager', email: 'Ana.Beispiel@Example.com', phone: '+34 600 000 000', language: 'es' };
const purpose = 'Informationen zu Kooperationsmöglichkeiten von tri-hotel.de per E-Mail';
const build = () => ({
  'inquiry.sent': hub.inquirySent({ inquiry, entity, site, ranking }),
  'inquiry.answered': hub.inquiryAnswered({ inquiry, entity, site, ranking, answers: 6, confirmed: 2, photos: 3, consents: ['photos_profile', 'partner_contact'] }),
  'contact.profile': hub.contactProfile({
    inquiry, entity, site, person, collectedAt: new Date('2026-10-22T17:40:00Z'),
    notice: { text: 'Ihre Angaben speichern wir als Ansprechpartner des Hotels (Art. 6 Abs. 1 f DSGVO).', version: '2026-11a', url: 'https://tri-hotel.de/datenschutz#anfragen' },
  }),
  'contact.consent': hub.contactConsent({
    inquiry, entity, site, person: { ...person, phone: null }, purpose, text: fx('contact.consent').data.consent.text, textVersion: '2026-10b', language: 'de',
    givenAt: new Date('2026-10-22T17:40:00Z'), doubleOptInSentAt: new Date('2026-10-22T17:40:05Z'), doubleOptInConfirmedAt: new Date('2026-10-22T18:02:00Z'),
  }),
  'photos.permission': hub.photosPermission({
    inquiry, entity, site, scopes: ['photos_profile', 'photos_social'], photos: 3, credit: '© Club La Santa', textVersion: '2026-10b', grantedAt: new Date('2026-10-22T17:40:00Z'),
  }),
});

test('Ereignisse: alle Typen entsprechen den Fixtures im Vertrag (Form des Hub-Empfängers)', () => {
  const built = build();
  for (const [type, ev] of Object.entries(built)) {
    assert.deepEqual(shapeErrors(ev, fx(type)), [], type);
    assert.equal(ev.type, type);
    assert.match(ev.id, UUID);
    assert.equal(ev.version, 1);
    assert.equal(ev.site, 'tri-hotel.de');
    assert.deepEqual(ev.subject, { kind: 'entity', id: entity.id, name: 'Club La Santa' });
    // gleiche Inhalte wie die Fixtures (bis auf die zufällige ID)
    assert.deepEqual({ ...ev, id: null }, { ...fx(type), id: null }, type);
  }
  assert.equal(built['contact.profile'].data.person.email, 'ana.beispiel@example.com', 'E-Mail klein geschrieben');
  assert.equal(built['contact.profile'].data.person.salutation, 'frau');
  assert.notEqual(hub.inquirySent({ inquiry, entity, site, ranking }).id, built['inquiry.sent'].id, 'jede Meldung eine neue ID');
  // Camp-Anbieter als subject
  const camp = hub.inquirySent({ inquiry, entity: { kind: 'camp_provider', id: 'c1', name: 'Camp' }, site, ranking: null });
  assert.deepEqual(camp.subject, { kind: 'camp_provider', id: 'c1', name: 'Camp' });
});

// Pflichtprüfung wie im Hub (danielreuland-com src/services/events.js check()), damit der Hub kein Ereignis mit 400 ablehnt
function hubCheck(ev) {
  const errors = [];
  if (typeof ev.id !== 'string' || ev.id.length < 8 || ev.id.length > 100) errors.push('id');
  if (!hub.TYPES.includes(ev.type)) errors.push('type');
  if (!ev.occurredAt || Number.isNaN(Date.parse(ev.occurredAt))) errors.push('occurredAt');
  const s = ev.subject;
  if (!s || !['entity', 'camp_provider'].includes(s.kind) || !s.id || !s.name) errors.push('subject');
  const d = ev.data || {};
  if (ev.type.startsWith('contact.') && (!d.person || !d.person.lastName || !d.person.email)) errors.push('person');
  if (ev.type === 'contact.consent') {
    const c = d.consent || {};
    if (c.channel !== 'email' || !c.text || !c.givenAt || !c.doubleOptIn || !c.doubleOptIn.confirmedAt) errors.push('consent');
  }
  if (JSON.stringify(ev).length > 64 * 1024) errors.push('größer als 64 KB');
  return errors;
}

test('Ereignisse: erfüllen die Pflichtprüfung des Hubs', () => {
  for (const [type, ev] of Object.entries(build())) assert.deepEqual(hubCheck(ev), [], type);
});

test('Ereignisse: Anfrage-Ereignisse ohne Personendaten (Empfänger, Name, Mailtext)', () => {
  for (const ev of [hub.inquirySent({ inquiry, entity, site, ranking }), hub.inquiryAnswered({ inquiry, entity, site, ranking })]) {
    const json = JSON.stringify(ev);
    assert.ok(!json.includes('info@clublasanta.com'));
    assert.ok(!json.includes('Ana'));
    assert.ok(!json.includes('Mailtext'));
  }
});

test('Ereignisse: Pflichtangaben und Double-Opt-in werden erzwungen', () => {
  const base = { inquiry, entity, site, person: { lastName: 'B', email: 'a@b.de' }, textVersion: 'v1', text: 'Wortlaut', givenAt: new Date() };
  assert.throws(() => hub.contactConsent(base), /Double-Opt-in/);
  assert.throws(() => hub.contactConsent({ ...base, doubleOptInConfirmedAt: new Date(), text: '' }), /Wortlaut/);
  assert.throws(() => hub.contactConsent({ ...base, doubleOptInConfirmedAt: new Date(), givenAt: null }), /Zeitpunkt/);
  assert.throws(() => hub.contactConsent({ ...base, doubleOptInConfirmedAt: new Date(), person: { lastName: 'B' } }), /E-Mail/);
  assert.throws(() => hub.contactConsent({ ...base, doubleOptInConfirmedAt: new Date(), person: { email: 'a@b.de' } }), /Nachnamen/);
  assert.throws(() => hub.contactProfile({ inquiry, entity, site, person: { lastName: 'B', email: 'kein-mail' }, notice: { version: 'v' } }), /E-Mail/);
  assert.throws(() => hub.contactProfile({ inquiry, entity, site, person: { lastName: 'B', email: 'a@b.de' } }), /Datenschutzhinweis/);
  assert.equal(hub.contactProfile({ inquiry, entity, site, person: { salutation: 'Dr.', lastName: 'B', email: 'a@b.de' }, notice: { version: 'v' } }).data.person.salutation, null);
  assert.throws(() => hub.photosPermission({ inquiry, entity, site, scopes: ['print'], textVersion: 'v' }), /scopes/);
  assert.throws(() => hub.photosPermission({ inquiry, entity, site, scopes: [], textVersion: 'v' }), /scopes/);
  assert.throws(() => hub.photosPermission({ inquiry, entity, site, scopes: ['profile'] }), /Version/);
  const denied = hub.photosPermission({ inquiry, entity, site, granted: false, textVersion: 'v', withdrawnAt: new Date('2026-12-01T10:00:00Z') });
  assert.equal(denied.data.granted, false);
  assert.equal(denied.occurredAt, '2026-12-01T10:00:00.000Z');
  assert.throws(() => hub.envelope({ type: 'hotel.live', site, entity, data: {} }), /Unbekannter Ereignistyp/);
  assert.throws(() => hub.envelope({ type: 'inquiry.sent', site, entity: null, data: {} }), /subject/);
  assert.throws(() => hub.envelope({ type: 'inquiry.sent', site, entity: { kind: 'region', id: 'x', name: 'y' }, data: {} }), /subject-Art/);
});

// --- Speichern und Zustellen mit Test-Datenbank im Speicher ----------------------------------------------------------

function fakeDb() {
  const rows = new Map();
  const orig = { query: db.query, one: db.one, many: db.many };
  db.query = async (sql, p) => {
    if (/^\s*INSERT INTO hub_events/.test(sql)) {
      if (!rows.has(p[0])) rows.set(p[0], { id: p[0], type: p[1], entity_id: p[2], payload: JSON.parse(p[3]), status: 'pending', attempts: 0, last_error: null });
      return { rowCount: 1, rows: [] };
    }
    const r = rows.get(p[0]);
    if (/SET attempts = \$2, last_error = \$3/.test(sql)) Object.assign(r, { attempts: p[1], last_error: p[2] });
    else if (/SET attempts = \$2/.test(sql)) r.attempts = p[1];
    else if (/SET status = \$2, payload = NULL/.test(sql)) Object.assign(r, { status: p[1], payload: null, last_error: p[2] });
    else throw new Error(`unerwartet: ${sql}`);
    return { rowCount: 1, rows: [] };
  };
  db.one = async (sql, p) => (rows.has(p[0]) ? { ...rows.get(p[0]) } : null);
  return { rows, restore: () => Object.assign(db, orig) };
}

test('emit: speichert und stellt in die Warteschlange (mit Wiederholung), Fehler brechen nichts ab', async () => {
  const f = fakeDb();
  const jobs = [];
  hub.setEnqueue(async (name, data, opts) => jobs.push({ name, data, opts }));
  try {
    const ev = hub.inquirySent({ inquiry, entity, site, ranking });
    assert.equal(await hub.emit(ev), ev.id);
    assert.equal(f.rows.get(ev.id).status, 'pending');
    assert.deepEqual(jobs, [{ name: 'hub-event', data: { eventId: ev.id }, opts: { retryLimit: 9, retryDelay: 120, retryBackoff: true } }]);
    // Bau-Fehler (z. B. fehlende Pflichtangabe) oder DB-Fehler: nur protokolliert, Rückgabe null
    assert.equal(await hub.emitSafe(hub.contactConsent, { inquiry, entity, site, person: {} }), null);
    hub.setEnqueue(async () => { throw new Error('boss weg'); });
    assert.equal(await hub.emit(hub.inquirySent({ inquiry, entity, site, ranking })), null);
  } finally {
    hub.setEnqueue(async () => {});
    f.restore();
  }
});

test('deliver: ohne Ziel nur protokolliert (kein Fehler), Inhalt danach gelöscht', async () => {
  const f = fakeDb();
  try {
    const ev = hub.inquirySent({ inquiry, entity, site, ranking });
    await hub.emit(ev);
    let fetched = false;
    const r = await hub.deliver(ev.id, { target: { url: null, secret: null }, fetchFn: async () => { fetched = true; } });
    assert.equal(r.status, 'skipped');
    assert.equal(fetched, false);
    assert.equal(f.rows.get(ev.id).payload, null);
    assert.equal((await hub.deliver(ev.id, { target: { url: 'http://x', secret: 'y' } })).status, 'skipped', 'nicht erneut senden');
  } finally {
    f.restore();
  }
});

test('deliver: signierter POST mit Nonce, 2xx = zugestellt', async () => {
  const f = fakeDb();
  const secret = 's'.repeat(40);
  try {
    const ev = hub.inquiryAnswered({ inquiry, entity, site, ranking, answers: 2 });
    await hub.emit(ev);
    const seen = [];
    const fetchFn = async (url, opts) => { seen.push({ url, opts }); return { status: 202 }; };
    const r = await hub.deliver(ev.id, { target: { url: 'http://127.0.0.1:3020/internal/v1/events', secret }, fetchFn });
    assert.equal(r.status, 'sent');
    assert.equal(f.rows.get(ev.id).payload, null);
    assert.equal(f.rows.get(ev.id).attempts, 1);
    const { opts } = seen[0];
    assert.equal(opts.method, 'POST');
    assert.equal(opts.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(opts.body), ev);
    // Empfänger (Hub) prüft mit derselben Bibliothek und Nonce-Pflicht
    const headers = Object.fromEntries(Object.entries(opts.headers).map(([k, v]) => [k.toLowerCase(), v]));
    const v = auth.verify({ keys: auth.parseKeys(`tri-hotel:${secret}`), headers, method: 'POST', path: '/internal/v1/events', body: opts.body, requireNonce: true });
    assert.equal(v.ok, true);
    assert.match(v.nonce, UUID);
  } finally {
    f.restore();
  }
});

test('deliver: 5xx/429/Netzfehler → Wiederholung (wirft), 4xx → endgültig, nach 10 Versuchen aufgegeben', async () => {
  const f = fakeDb();
  const target = { url: 'http://127.0.0.1:3020/internal/v1/events', secret: 's'.repeat(40) };
  try {
    const ev = hub.inquirySent({ inquiry, entity, site, ranking });
    await hub.emit(ev);
    await assert.rejects(hub.deliver(ev.id, { target, fetchFn: async () => ({ status: 503 }) }), /HTTP 503 – neuer Versuch/);
    await assert.rejects(hub.deliver(ev.id, { target, fetchFn: async () => ({ status: 429 }) }), /HTTP 429/);
    await assert.rejects(hub.deliver(ev.id, { target, fetchFn: async () => { throw new Error('ECONNREFUSED'); } }), /Netzwerk: ECONNREFUSED/);
    assert.equal(f.rows.get(ev.id).attempts, 3);
    assert.equal(f.rows.get(ev.id).status, 'pending');
    assert.ok(f.rows.get(ev.id).payload, 'Inhalt bleibt bis zur Zustellung');

    const ev2 = hub.inquirySent({ inquiry, entity, site, ranking });
    await hub.emit(ev2);
    assert.equal((await hub.deliver(ev2.id, { target, fetchFn: async () => ({ status: 400 }) })).status, 'failed');
    assert.equal(f.rows.get(ev2.id).payload, null);
    assert.equal(f.rows.get(ev2.id).last_error, 'HTTP 400');

    f.rows.get(ev.id).attempts = hub.MAX_ATTEMPTS - 1;
    assert.equal((await hub.deliver(ev.id, { target, fetchFn: async () => ({ status: 500 }) })).status, 'failed');
    assert.equal(f.rows.get(ev.id).attempts, hub.MAX_ATTEMPTS);
  } finally {
    f.restore();
  }
});

test('retriable: nur vorübergehende Fehler', () => {
  for (const s of [null, 408, 409, 429, 500, 502, 503]) assert.equal(hub.retriable(s), true, String(s));
  for (const s of [400, 401, 403, 404, 422]) assert.equal(hub.retriable(s), false, String(s));
});
