const test = require('node:test');
const assert = require('node:assert/strict');
const leads = require('../src/services/leads');
const mt = require('../src/services/mailtemplates');

const provider = { id: 'p', name: 'Beispiel-Camps' };
const hotels = [{ entity_id: 'e1', hotel_name: 'Hotel A' }];
const now = new Date('2026-10-15');

test('Camp-Anfrage: Pflichtangaben und Einwilligung', () => {
  const bad = leads.validate({ name: 'A', email: 'x', persons: '0' }, provider, hotels, now);
  assert.equal(bad.errors.length, 5);
  const ok = leads.validate({ name: 'Anna K.', email: 'Anna@Example.com', period_month: '2027-03', persons: '2', level: 'intermediate', entity_id: 'e1', consent: 'on' }, provider, hotels, now);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.data.email, 'anna@example.com');
  assert.equal(ok.data.period_month, '2027-03-01');
  assert.equal(ok.data.hotel_text, 'Hotel A');
  const old = leads.validate({ name: 'Anna', email: 'a@b.de', period_month: '2024-01', persons: '1', consent: 'on' }, provider, hotels, now);
  assert.match(old.errors.join(' '), /Monat/, 'Monat in der Vergangenheit zählt nicht');
  const foreign = leads.validate({ name: 'Anna', email: 'a@b.de', period_note: 'Ostern', persons: '1', entity_id: 'fremd', consent: 'on' }, provider, hotels, now);
  assert.equal(foreign.data.entity_id, null, 'nur Hotels des Anbieters');
});

test('Camp-Anfrage: Mail an den Anbieter lässt keine Formatierung oder Links aus Eingaben zu', () => {
  const v = mt.varsFor('lead-forward', { entityName: 'Beispiel-Camps', lead: { name: 'Eve **fett**', email: 'e@x.de', persons: 2, message: 'Klick [hier](https://evil.example)' }, levelLabel: null });
  assert.ok(!/\*\*|\[|\]/.test(v.anfrage));
  const html = mt.bodyHtml('{{anfrage}}', v);
  assert.ok(!/<a /.test(html), 'kein Link aus der Nachricht');
  assert.match(html, /Personen: 2/);
});
