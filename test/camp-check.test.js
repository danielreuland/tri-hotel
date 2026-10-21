const test = require('node:test');
const assert = require('node:assert/strict');
const check = require('../src/services/camp-check');

const pages = [
  { url: 'https://camp.example/', text: 'Triathlon-Trainingscamps auf Lanzarote und Mallorca. Unser Camp im Hotel Club La Santa. 7 Tage ab 1.290 €. Termin: 14.–21. März 2027.' },
  { url: 'https://camp.example/impressum', text: 'Impressum: Camp GmbH, Hauptstraße 1, 64283 Darmstadt. E-Mail: info@camp.example' },
];
const q = (u, t) => ({ evidence_url: u, evidence_text: t });

const raw = {
  topic: { on_topic: true, reason: 'Triathlon-Camps', ...q(pages[0].url, 'Triathlon-Trainingscamps auf Lanzarote') },
  imprint: { company: 'Camp GmbH', address: 'Hauptstraße 1, 64283 Darmstadt', ...q(pages[1].url, 'Camp GmbH, Hauptstraße 1') },
  contact: { email: 'info@camp.example', form: false, phone: '', ...q(pages[1].url, 'E-Mail: info@camp.example') },
  profile: { model: 'coach', seat: 'Darmstadt', summary: 'Camps für Triathleten', ...q(pages[1].url, 'Darmstadt') },
  destinations: [{ name: 'Lanzarote', ...q(pages[0].url, 'Lanzarote') }],
  features: { hotel: { value: 'yes', ...q(pages[0].url, 'im Hotel Club La Santa') }, beginner: { value: true, ...q(pages[0].url, 'erfunden') } },
  prices: [{ label: '7 Tage', duration: '7 Tage', price: 'ab 1.290 €', included: '', ...q(pages[0].url, '7 Tage ab 1.290 €') }],
  dates: [{ label: 'März 2027', start: '2027-03-14', end: '2027-03-21', ...q(pages[0].url, 'Termin: 14.–21. März 2027') }],
  hotels: [{ name: 'Club La Santa', place: 'Tinajo', country: 'es', website: 'nicht-url', ...q(pages[0].url, 'Hotel Club La Santa') },
    { name: 'Erfundenes Hotel', place: 'X', country: 'DE', website: '', ...q(pages[0].url, 'steht nicht auf der Seite') }],
};
const now = new Date('2026-10-20T10:00:00Z');

test('sanitize: nur Angaben mit wörtlicher Fundstelle, erlaubte Werte, saubere Länder und URLs', () => {
  const x = check.sanitize(raw, pages);
  assert.equal(x.topic.on_topic, true);
  assert.equal(x.imprint.company, 'Camp GmbH');
  assert.equal(x.model, 'coach');
  assert.equal(x.features.hotel.value, 'yes');
  assert.equal(x.features.beginner, null, 'Zitat steht nicht auf der Seite');
  assert.deepEqual(x.hotels.map((h) => [h.name, h.country, h.website]), [['Club La Santa', 'ES', null]], 'erfundenes Hotel fällt weg, ungültige URL wird null');
  assert.equal(x.dates[0].start, '2027-03-14');
  assert.equal(check.sanitize({ profile: { model: 'luxus', ...q(pages[1].url, 'Darmstadt') } }, pages).model, null);
});

test('qualify: alles belegt → qualifiziert, mit Vollständigkeit', () => {
  const r = check.qualify(check.sanitize(raw, pages), { pagesRead: 2, now });
  assert.equal(r.qualification, 'qualified');
  assert.ok(r.rules.every((x) => x.level === 'ok'));
  assert.ok(r.completeness >= 80);
});

test('qualify: Website nicht erreichbar → nicht qualifiziert', () => {
  const r = check.qualify(check.sanitize({}, []), { pagesRead: 0, now });
  assert.equal(r.qualification, 'not_qualified');
  assert.equal(r.rules[0].level, 'fail');
});

test('qualify: passt ausdrücklich nicht zum Thema → nicht qualifiziert', () => {
  const x = check.sanitize({ ...raw, topic: { on_topic: false, reason: 'Yoga-Retreats', ...q(pages[0].url, 'Lanzarote und Mallorca') } }, pages);
  assert.equal(check.qualify(x, { pagesRead: 2, now }).qualification, 'not_qualified');
});

test('qualify: nicht gefunden ist kein Nein → prüfen', () => {
  const x = check.sanitize({ ...raw, imprint: null, topic: null }, pages);
  const r = check.qualify(x, { pagesRead: 2, now });
  assert.equal(r.qualification, 'review');
  assert.equal(r.rules.find((y) => y.key === 'imprint').level, 'warn');
});

test('qualify: keine oder nur vergangene Termine → prüfen, kein Ausschluss', () => {
  const past = check.sanitize({ ...raw, dates: [{ label: 'März 2027', start: '2025-03-14', end: '2025-03-21', ...q(pages[0].url, 'Termin: 14.–21. März 2027') }] }, pages);
  const r = check.qualify(past, { pagesRead: 2, now });
  assert.equal(r.qualification, 'review');
  assert.match(r.rules.find((y) => y.key === 'dates').text, /vergangene/);
  assert.equal(check.qualify(check.sanitize({ ...raw, dates: [] }, pages), { pagesRead: 2, now }).qualification, 'review');
});

test('qualify: fehlende Preise allein ändern die Ampel nicht', () => {
  assert.equal(check.qualify(check.sanitize({ ...raw, prices: [] }, pages), { pagesRead: 2, now }).qualification, 'qualified');
});

test('upcomingDates: laufende Saison zählt (Ende in der Zukunft), mehr als 18 Monate voraus nicht', () => {
  const d = [{ start: '2026-10-15', end: '2026-10-25' }, { start: '2029-01-01', end: null }, { start: '2026-01-01', end: '2026-01-08' }];
  assert.deepEqual(check.upcomingDates(d, now).map((x) => x.start), ['2026-10-15']);
});

test('fromItems: flache KI-Einträge → Form für sanitize, erster Eintrag je Einzelangabe zählt', () => {
  const q = { evidence_url: 'https://camp.example/', evidence_text: 'Triathlon-Trainingscamps auf Lanzarote' };
  const raw = check.fromItems([
    { kind: 'topic', value: 'yes', detail: 'Triathlon-Camps', ...q },
    { kind: 'topic', value: 'no', detail: 'zweiter Eintrag zählt nicht', ...q },
    { kind: 'feature', name: 'beginner', value: 'yes', ...q },
    { kind: 'feature', name: 'women', value: 'unklar', ...q },
    { kind: 'feature', name: 'hotel', value: 'partner', ...q },
    { kind: 'date', name: 'März', start: '2027-03-14', end: '', ...q },
    { kind: 'hotel', name: 'Club La Santa', place: 'Tinajo', country: 'ES', website: '', ...q },
  ]);
  assert.equal(raw.topic.on_topic, true);
  assert.deepEqual(Object.keys(raw.features).sort(), ['beginner', 'hotel']);
  assert.equal(raw.features.beginner.value, true);
  assert.equal(raw.dates[0].start, '2027-03-14');
  const x = check.sanitize(raw, pages);
  assert.equal(x.topic.on_topic, true);
  assert.equal(x.features.hotel.value, 'partner');
  assert.equal(x.hotels[0].name, 'Club La Santa');
});

test('withProfileContact + qualificationOf: Kontakt im Profil erfüllt die Regel, Ampel springt ggf. auf grün', () => {
  const rules = [
    { key: 'website', required: true, level: 'ok' },
    { key: 'contact', required: true, level: 'warn', text: 'Kein Kontaktweg gefunden' },
    { key: 'prices', level: 'warn' },
  ];
  assert.equal(check.qualificationOf(rules), 'review');
  const next = check.withProfileContact(rules, { contact_email: 'info@camp.example', contact_phone: null });
  assert.equal(next.find((r) => r.key === 'contact').level, 'ok');
  assert.match(next.find((r) => r.key === 'contact').text, /info@camp\.example/);
  assert.equal(check.qualificationOf(next), 'qualified');
  assert.deepEqual(check.withProfileContact(rules, {}), rules, 'ohne Kontakt unverändert');
  assert.equal(check.qualificationOf([{ key: 'topic', required: true, level: 'fail' }]), 'not_qualified');
});
