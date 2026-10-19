const test = require('node:test');
const assert = require('node:assert/strict');
const mt = require('../src/services/mailtemplates');

// Knopf und Gültigkeit dürfen nicht wegfallen, wenn keine Bewertung mitgeschickt wurde
test('Vorschlag bestätigen: Knopf auch ohne Bewertung', () => {
  const vars = { hotel: 'Hotel X', ranking: 'Triathlon-Hotels', link: 'https://tri-hotel.de/bestaetigen/abc', stunden: '72', bewertung: '' };
  const html = mt.bodyHtml(mt.DEFAULTS.verify.body, vars);
  assert.match(html, /href="https:\/\/tri-hotel\.de\/bestaetigen\/abc"[^>]*>Vorschlag bestätigen</);
  assert.match(html, /72 Stunden gültig/);
  const withReview = mt.bodyHtml(mt.DEFAULTS.verify.body, { ...vars, bewertung: 'Deine Bewertung wird mit bestätigt.' });
  assert.match(withReview, /Vorschlag bestätigen</);
  assert.match(withReview, /Deine Bewertung wird mit bestätigt/);
});
