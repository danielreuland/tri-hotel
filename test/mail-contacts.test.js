const test = require('node:test');
const assert = require('node:assert/strict');
const mc = require('../src/services/mail-contacts');
const hubEvents = require('../src/services/hub-events');

test('Mail-Kontakte: Personenname aus dem Anzeigenamen', () => {
  assert.deepEqual(mc.personName('Charlotte Klinghoffer', 'c@villa.de', 'Villa'), { firstName: 'Charlotte', lastName: 'Klinghoffer' });
  assert.deepEqual(mc.personName('Molnár, Tomáš', 't@x.com', 'X'), { firstName: 'Tomáš', lastName: 'Molnár' });
  assert.deepEqual(mc.personName('"Anna Maria Lopez"', 'a@x.com', 'X'), { firstName: 'Anna Maria', lastName: 'Lopez' });
  // Sammel-Absender: ganzer Anzeigename als Nachname, kein Vorname
  assert.deepEqual(mc.personName('Arena Info', 'info@arena.com.cy', 'Coral Beach'), { firstName: null, lastName: 'Arena Info' });
  assert.deepEqual(mc.personName('Reservas Marina Elite', 'reservas@marinaelite.com', 'Marina'), { firstName: null, lastName: 'Reservas Marina Elite' });
  assert.deepEqual(mc.personName('Booking', 'b@x.com', 'X'), { firstName: null, lastName: 'Booking' });
  // ohne Anzeigenamen (oder nur die Adresse/der Adressteil): Name des Betriebs
  assert.deepEqual(mc.personName(null, 'info@maspelegri.com', 'Mas Pelegri'), { firstName: null, lastName: 'Mas Pelegri' });
  assert.deepEqual(mc.personName('info@maspelegri.com', 'info@maspelegri.com', 'Mas Pelegri'), { firstName: null, lastName: 'Mas Pelegri' });
  assert.deepEqual(mc.personName('info', 'info@maspelegri.com', 'Mas Pelegri'), { firstName: null, lastName: 'Mas Pelegri' });
});

test('Mail-Kontakte: welche Mails gemeldet werden', () => {
  const ctx = { own: new Set(['tri-hotel.de', 'fitnessracing-hotel.de']), known: new Set(['schon@hotel.de']) };
  const base = { kind: 'mail', status: 'new', entity_id: 'e1', camp_provider_id: null, from_email: 'info@maspelegri.com' };
  assert.equal(mc.skipReason(base, ctx), null);
  assert.equal(mc.skipReason({ ...base, status: 'done' }, ctx), null);
  assert.equal(mc.skipReason({ ...base, entity_id: null, camp_provider_id: 'c1' }, ctx), null);
  assert.equal(mc.skipReason({ ...base, kind: 'auto_reply' }, ctx), 'auto_reply');
  assert.equal(mc.skipReason({ ...base, kind: 'bounce', from_email: 'mailer-daemon@kundenserver.de' }, ctx), 'bounce');
  assert.equal(mc.skipReason({ ...base, status: 'ignored' }, ctx), 'ignored');
  assert.equal(mc.skipReason({ ...base, entity_id: null }, ctx), 'unassigned');
  assert.equal(mc.skipReason({ ...base, from_email: 'unbekannt' }, ctx), 'invalid');
  assert.equal(mc.skipReason({ ...base, from_email: 'daniel@tri-hotel.de' }, ctx), 'own');
  assert.equal(mc.skipReason({ ...base, from_email: 'Schon@Hotel.de' }, ctx), 'known');
});

test('Mail-Kontakte: Ereignis entspricht dem Vertrag (ohne Werbe-Erlaubnis, mit Hinweis)', () => {
  const ev = hubEvents.contactProfile({
    inquiry: { id: 'i1' }, entity: { id: 'e1', name: 'Mas Pelegri' }, site: { primary_domain: 'tri-hotel.de' }, collectedAt: new Date('2026-11-16T15:45:00Z'),
    person: { ...mc.personName(null, 'info@maspelegri.com', 'Mas Pelegri'), email: 'info@maspelegri.com', language: null },
    notice: { text: 'x', version: mc.NOTICE_VERSION, url: 'https://tri-hotel.de/datenschutz' },
  });
  assert.equal(ev.type, 'contact.profile');
  assert.equal(ev.data.legalBasis, 'legitimate_interest');
  assert.equal(ev.data.person.lastName, 'Mas Pelegri');
  assert.equal(ev.data.person.email, 'info@maspelegri.com');
  assert.equal(ev.data.notice.version, mc.NOTICE_VERSION);
  assert.equal(ev.occurredAt, '2026-11-16T15:45:00.000Z');
  assert.deepEqual(ev.subject, { kind: 'entity', id: 'e1', name: 'Mas Pelegri' });
});
