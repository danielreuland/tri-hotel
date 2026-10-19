const test = require('node:test');
const assert = require('node:assert/strict');
const mb = require('../src/services/mailbox');
const mailer = require('../src/services/mailer');

// Attrappe der Datenbank-Abfragen
function lookups({ logs = {}, senders = {}, domains = {} } = {}) {
  return {
    async byMessageIds(ids) { return ids.map((id) => logs[id]).find(Boolean) || null; },
    async bySender(email) { return senders[email] || { entities: [], inquiries: [], providers: [] }; },
    async byDomain(d) { return domains[d] || []; },
  };
}

test('Postfach: Message-IDs, Domains', () => {
  assert.deepEqual(mb.extractIds('<a@x.de> <b@y.de>'), ['<a@x.de>', '<b@y.de>']);
  assert.deepEqual(mb.extractIds(['<a@x.de>', '<a@x.de>']), ['<a@x.de>']);
  assert.deepEqual(mb.extractIds(undefined), []);
  assert.equal(mb.baseDomain('mail.hotel-sonne.de'), 'hotel-sonne.de');
  assert.equal(mb.baseDomain('www.hotel.co.uk'), 'hotel.co.uk');
  assert.equal(mb.websiteDomain('https://www.playitas.net/de/hotel'), 'playitas.net');
  assert.equal(mb.websiteDomain('playitas.net'), 'playitas.net');
  assert.equal(mb.domainOf('Info@Playitas.NET'), 'playitas.net');
  assert.match(mailer.newMessageId('"Mia · tri-hotel.de" <info@tri-hotel.de>'), /^<[0-9a-f-]{36}@tri-hotel\.de>$/);
});

test('Postfach: Abwesenheit und Unzustellbar erkennen', () => {
  assert.equal(mb.classify({ headers: { 'auto-submitted': 'auto-replied' }, subject: 'Re: Ihre Anfrage' }), 'auto_reply');
  assert.equal(mb.classify({ headers: { 'auto-submitted': 'no' }, subject: 'Re: Ihre Anfrage' }), 'mail');
  assert.equal(mb.classify({ headers: {}, subject: 'Abwesenheitsnotiz: Max Muster' }), 'auto_reply');
  assert.equal(mb.classify({ headers: { precedence: 'auto_reply' }, subject: 'x' }), 'auto_reply');
  assert.equal(mb.classify({ headers: {}, fromEmail: 'MAILER-DAEMON@mx.ionos.de', subject: 'Mail delivery failed' }), 'bounce');
  assert.equal(mb.classify({ headers: {}, subject: 'Undelivered Mail Returned to Sender' }), 'bounce');
  assert.equal(mb.classify({ headers: {}, contentType: '{"value":"multipart/report","params":{"report-type":"delivery-status"}}', subject: 'x' }), 'bounce');
  assert.equal(mb.classify({ headers: {}, fromEmail: 'info@hotel.de', subject: 'AW: Angaben zu Ihrem Hotel' }), 'mail');
});

test('Postfach: Zuordnung über die beantwortete Mail', async () => {
  const l = lookups({ logs: { '<m1@tri-hotel.de>': { id: 7, entity_id: 'e1', inquiry_id: 'i1', persona_id: 'mia' } } });
  const r = await mb.match({ fromEmail: 'jemand@anders.de', inReplyTo: '<m1@tri-hotel.de>' }, l);
  assert.deepEqual(r, { entity_id: 'e1', inquiry_id: 'i1', camp_provider_id: null, persona_id: 'mia', email_log_id: 7, matched_by: 'thread' });
  // Verweis nur in References (z. B. nach mehreren Antworten)
  const r2 = await mb.match({ fromEmail: 'x@y.de', refs: ['<alt@z.de>', '<m1@tri-hotel.de>'] }, l);
  assert.equal(r2.entity_id, 'e1');
});

test('Postfach: Zuordnung über Absender, Domain und Persona-Adresse', async () => {
  const l = lookups({
    senders: {
      'info@sonne.de': { entities: ['e1'], inquiries: [{ id: 'i1', entity_id: 'e1', persona_id: 'mia' }], providers: [] },
      'kette@gruppe.de': { entities: ['e1', 'e2'], inquiries: [], providers: [] },
      'camp@coach.de': { entities: [], inquiries: [], providers: ['p1'] },
    },
    domains: { 'sonne.de': ['e1'], 'gruppe.de': ['e1', 'e2'] },
  });
  const personas = [{ id: 'ben', email: 'ben@tri-hotel.de' }];
  const s = await mb.match({ fromEmail: 'Info@Sonne.de' }, l);
  assert.deepEqual([s.entity_id, s.inquiry_id, s.persona_id, s.matched_by], ['e1', 'i1', 'mia', 'sender']);
  const amb = await mb.match({ fromEmail: 'kette@gruppe.de' }, l);
  assert.equal(amb.entity_id, null, 'mehrere Objekte mit derselben Adresse: von Hand zuordnen');
  assert.equal(amb.matched_by, null);
  const dom = await mb.match({ fromEmail: 'rezeption@sonne.de' }, l);
  assert.deepEqual([dom.entity_id, dom.matched_by], ['e1', 'domain']);
  const free = await mb.match({ fromEmail: 'sonne@gmail.com' }, lookups({ domains: { 'gmail.com': ['e1'] } }));
  assert.equal(free.entity_id, null, 'Freemail-Domains nie über die Domain zuordnen');
  const prov = await mb.match({ fromEmail: 'camp@coach.de', toEmails: ['BEN@tri-hotel.de'] }, l, personas);
  assert.deepEqual([prov.camp_provider_id, prov.persona_id, prov.matched_by], ['p1', 'ben', 'sender']);
  const none = await mb.match({ fromEmail: 'fremd@nirgends.de' }, l);
  assert.equal(none.matched_by, null);
});

test('Postfach: Textfassung dekodiert Zeichen', () => {
  assert.equal(mailer.htmlToText('<p>&gt; Zitat &amp; mehr &lt;x&gt;</p>'), '> Zitat & mehr <x>');
  assert.equal(mailer.htmlToText('&amp;gt;'), '&gt;', 'doppelt kodiert bleibt einmal kodiert');
});

test('Postfach: Betreff und Zitat der Antwort', () => {
  assert.equal(mb.replySubject('Angaben zu Ihrem Hotel'), 'Re: Angaben zu Ihrem Hotel');
  assert.equal(mb.replySubject('AW: Angaben'), 'AW: Angaben');
  assert.equal(mb.replySubject(''), 'Re:');
  const q = mb.quote({ body_text: 'Zeile 1\nZeile 2', from_name: 'Anna', received_at: '2026-10-19T08:00:00Z' });
  assert.match(q, /schrieb Anna:\n> Zeile 1\n> Zeile 2$/);
  assert.equal(mb.quote({ body_text: '' }), '');
});
