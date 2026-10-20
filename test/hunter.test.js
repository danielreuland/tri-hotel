const test = require('node:test');
const assert = require('node:assert/strict');
const hunter = require('../src/services/hunter');

const src = (uri, still = true) => ({ uri, still_on_page: still });

test('pick: nur allgemeine Adressen der eigenen Domain mit Fundstelle', () => {
  const r = hunter.pick([
    { value: 'maria.lopez@hotel-mar.es', type: 'personal', confidence: 99, sources: [src('https://hotel-mar.es/team')] },
    { value: 'info@andere-domain.com', type: 'generic', confidence: 95, sources: [src('https://x.com')] },
    { value: 'info@hotel-mar.es', type: 'generic', confidence: 80, sources: [src('https://hotel-mar.es/kontakt')] },
  ], 'hotel-mar.es');
  assert.deepEqual(r, { email: 'info@hotel-mar.es', confidence: 80, evidenceUrl: 'https://hotel-mar.es/kontakt', stillOnPage: true });
});

test('pick: Reservierung vor info, ungeeignete Postfächer ausgeschlossen, Subdomain erlaubt', () => {
  const r = hunter.pick([
    { value: 'privacy@hotel-mar.es', type: 'generic', confidence: 99, sources: [src('https://hotel-mar.es/datenschutz')] },
    { value: 'jobs@hotel-mar.es', type: 'generic', confidence: 99, sources: [src('https://hotel-mar.es/jobs')] },
    { value: 'info@hotel-mar.es', type: 'generic', confidence: 90, sources: [src('https://hotel-mar.es/')] },
    { value: 'Reservas@mail.hotel-mar.es', type: 'generic', confidence: 60, sources: [src('https://hotel-mar.es/booking')] },
  ], 'hotel-mar.es');
  assert.equal(r.email, 'reservas@mail.hotel-mar.es');
});

test('pick: ohne Fundstelle kein Vorschlag; noch auf der Seite wird bevorzugt', () => {
  assert.equal(hunter.pick([{ value: 'info@hotel-mar.es', type: 'generic', confidence: 90, sources: [] }], 'hotel-mar.es'), null);
  const r = hunter.pick([
    { value: 'info@hotel-mar.es', type: 'generic', confidence: 90, sources: [src('https://hotel-mar.es/alt', false), src('https://hotel-mar.es/neu', true)] },
  ], 'hotel-mar.es');
  assert.equal(r.evidenceUrl, 'https://hotel-mar.es/neu');
  assert.equal(hunter.pick(null, 'x.de'), null);
});
