const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const ejs = require('ejs');
const report = require('../src/services/daily-report');
const config = require('../src/config');
const mailer = require('../src/services/mailer');

const domains = [
  { domain: 'tri-hotel.de', label: 'tri-hotel.de', site_id: 's1', ranking_id: null },
  { domain: 'fitnessracing-hotel.de', label: 'fitnessracing-hotel.de', site_id: null, ranking_id: 'r2' },
];

test('previousDay: Vortag nach Berliner Zeit, auch kurz nach Mitternacht und rund um die Zeitumstellung', () => {
  assert.equal(report.previousDay(new Date('2026-11-06T06:00:00Z')), '2026-11-05');
  assert.equal(report.previousDay(new Date('2026-11-05T23:30:00Z')), '2026-11-05', 'in Berlin ist schon der 6.');
  assert.equal(report.previousDay(new Date('2026-07-01T22:30:00Z')), '2026-07-01', 'Sommerzeit: in Berlin ist schon der 2.');
  assert.equal(report.previousDay(new Date('2026-03-29T05:00:00Z')), '2026-03-28', 'Tag der Umstellung auf Sommerzeit');
  assert.equal(report.previousDay(new Date('2026-10-26T05:00:00Z')), '2026-10-25', 'Tag nach der Umstellung auf Winterzeit');
  assert.equal(report.previousDay(new Date('2027-01-01T05:00:00Z')), '2026-12-31', 'Jahreswechsel');
});

test('assemble: Besucher je Domain, Klicks nach Herkunft, Antworten nach Ranking', () => {
  const rows = report.assemble({
    domains,
    views: [{ visitors: 40, visits: 45, pageviews: 120 }, { visitors: 5, visits: 6, pageviews: 9 }],
    hotelViews: [{ total: 120, groups: { entity: 30 } }, { total: 120, groups: { entity: 2 } }],
    clickRows: [
      { kind: 'entity_link', source: 'tri-hotel.de', n: 3 },
      { kind: 'partner_search', source: 'direkt', n: 1 },
      { kind: 'entity_link', source: 'www.fitnessracing-hotel.de', n: 2 },
      { kind: 'camp', source: 'tri-hotel.de', n: 4 },
      { kind: 'unbekannt', source: 'tri-hotel.de', n: 99 },
    ],
    answerRows: [
      { ranking_id: 'r1', via: 'form', n: 2 },
      { ranking_id: null, via: 'mail', n: 1 },
      { ranking_id: 'r2', via: 'mail', n: 3 },
    ],
  });
  const [tri, fit] = rows;
  assert.deepEqual(
    [tri.visitors, tri.pageviews, tri.hotelClicks, tri.partnerClicks, tri.campClicks, tri.answersForm, tri.answersMail, tri.analytics],
    [40, 120, 30, 4, 4, 2, 1, 'ok'], 'unbekannte Herkunft und unbekanntes Ranking zählen zur ersten Domain');
  assert.deepEqual(
    [fit.visitors, fit.pageviews, fit.hotelClicks, fit.partnerClicks, fit.campClicks, fit.answersForm, fit.answersMail],
    [5, 9, 2, 2, 0, 0, 3]);
});

test('assemble: ohne Plausible bleiben Besucher unbekannt, Klicks und Antworten zählen weiter', () => {
  const off = report.assemble({ domains, views: [null, null], hotelViews: [null, null], clickRows: [{ kind: 'camp', source: '', n: 1 }], answerRows: [] });
  assert.equal(off[0].analytics, 'off');
  assert.equal(off[0].visitors, null);
  assert.equal(off[0].hotelClicks, null);
  assert.equal(off[0].campClicks, 1);
  const err = report.assemble({ domains, views: [{ error: true }, { visitors: 1, pageviews: 1 }], hotelViews: [{ error: true }, { error: true }], clickRows: [], answerRows: [] });
  assert.equal(err[0].analytics, 'error');
  assert.equal(err[0].pageviews, null);
  assert.equal(err[1].analytics, 'error', 'Fehler bei den Objektseiten');
  assert.equal(err[1].pageviews, 1);
  assert.equal(err[1].hotelClicks, null);
});

test('isInboxAddress: abgerufene Adresse und Antwortadressen sind gesperrt, Groß-/Kleinschreibung egal', (t) => {
  const before = { replyTo: config.mail.replyTo, provider: config.mail.inbound.provider, user: config.mail.inbound.imap.user };
  t.after(() => {
    config.mail.replyTo = before.replyTo;
    config.mail.inbound.provider = before.provider;
    config.mail.inbound.imap.user = before.user;
  });
  config.mail.replyTo = 'info@tri-hotel.de';
  config.mail.inbound.provider = 'imap';
  config.mail.inbound.imap.user = 'abruf@tri-hotel.de';
  assert.equal(report.isInboxAddress('INFO@tri-hotel.de '), true);
  assert.equal(report.isInboxAddress('abruf@tri-hotel.de'), true);
  assert.equal(report.isInboxAddress('zahlen@example.org', { mail_reply_to: 'zahlen@example.org' }), true);
  assert.equal(report.isInboxAddress('jemand@example.org', { mail_reply_to: 'info@tri-hotel.de' }), false);
});

test('send: ohne Adresse wird nichts versendet', async () => {
  await assert.rejects(report.send({ to: null }), /keine Empfängeradresse/);
});

test('Abmeldungen gelten nicht für den Bericht', () => {
  assert.equal(mailer.optOutApplies('daily-report', null), false);
});

const render = (sites) => ejs.renderFile(path.join(__dirname, '..', 'src', 'views', 'emails', 'daily-report.ejs'), {
  site: { name: 'tri-hotel.de', logo_text: 'TRI-HOTEL' }, baseUrl: 'https://example.test', ranking: { entity_label_pl: 'Gyms' }, dayLabel: 'Do., 05.11.2026', sites,
});

test('Mailvorlage: alle Kennzahlen je Seite, Beschriftung aus dem Ranking, lesbare Textfassung', async () => {
  const html = await render([
    { label: 'tri-hotel.de', visitors: 1234, pageviews: 2000, hotelClicks: 30, partnerClicks: 3, campClicks: 1, answersForm: 2, answersMail: 1, analytics: 'ok' },
    { label: 'zweite.de', visitors: null, pageviews: null, hotelClicks: null, partnerClicks: 0, campClicks: 0, answersForm: 0, answersMail: 0, analytics: 'error' },
  ]);
  const text = mailer.htmlToText(html);
  assert.match(text, /Unique Visitors: 1\.234/);
  assert.match(text, /Seitenaufrufe: 2\.000/);
  assert.match(text, /Klicks auf Gyms: 30/);
  assert.match(text, /Antworten von Betreibern: 3 \(Formular 2, Mail 1\)/);
  assert.match(text, /Partnerklicks: 3/);
  assert.match(text, /Camp-Klicks: 1/);
  assert.match(text, /zweite\.de/);
  assert.match(text, /Unique Visitors: k\. A\./);
  assert.match(text, /Plausible war nicht erreichbar/);
  assert.doesNotMatch(text, /Hotel/, 'keine festen Objekt-Beschriftungen');
});
