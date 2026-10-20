const test = require('node:test');
const assert = require('node:assert/strict');
const extractor = require('../src/services/extractor');

const ice = { code: 'rec_ice_bath', label: 'Eisbad', scoring: { type: 'bool', search_terms: ['Kältebad', 'Kryotherapie', 'Cold Plunge'] } };

test('Suchbegriffe: im KI-Auftrag als „auch genannt“, ohne Begriffe unverändert', () => {
  assert.equal(extractor.describeCriterion(ice), '- rec_ice_bath: Eisbad (auch genannt: Kältebad, Kryotherapie, Cold Plunge). Wert "true" oder "false"');
  assert.equal(extractor.describeCriterion({ code: 'x', label: 'Sauna', scoring: { type: 'bool' } }), '- x: Sauna. Wert "true" oder "false"');
});

test('Suchbegriffe steuern die Seitenauswahl (Unterseite „Kältekammer/Kryotherapie“ wird bevorzugt)', () => {
  const hints = extractor.hintsFrom(extractor.criterionTerms(ice));
  const start = '/';
  const cryo = extractor.scoreLink(new URL('https://hotel.example/wellness/kryotherapie'), 'Kryotherapie', start, hints);
  const other = extractor.scoreLink(new URL('https://hotel.example/zimmer/doppelzimmer'), 'Doppelzimmer', start, hints);
  assert.ok(cryo > other, `${cryo} > ${other}`);
});
