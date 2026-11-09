const test = require('node:test');
const assert = require('node:assert');
const evidence = require('../src/lib/evidence');

test('Art des Belegs: Link vor Vermerk vor Einschätzung', () => {
  assert.strictEqual(evidence.kind({ evidence_url: 'https://x', evidence_text: 'a', editorial_assessment: true }), 'link');
  assert.strictEqual(evidence.kind({ evidence_text: 'Telefonat 05.11.' }), 'note');
  assert.strictEqual(evidence.kind({ editorial_assessment: true }), 'assessment');
  assert.strictEqual(evidence.kind({}), 'none');
});

test('Beleg fehlt nur bei Stufe 1 und 2 ohne Link, Vermerk oder Einschätzung', () => {
  assert.strictEqual(evidence.missing({ trust: 2 }), true);
  assert.strictEqual(evidence.missing({ trust: '1' }), true);
  assert.strictEqual(evidence.missing({ trust: 2, url: 'https://x' }), false);
  assert.strictEqual(evidence.missing({ trust: 2, text: 'Satz von der Website' }), false);
  assert.strictEqual(evidence.missing({ trust: 2, assessment: true }), false);
  assert.strictEqual(evidence.missing({ trust: 4 }), false);
  assert.strictEqual(evidence.missing({ trust: 3 }), false);
});

test('„nein“ braucht keinen Beleg – es gibt keine Leistung zu belegen', () => {
  assert.strictEqual(evidence.needed({ bool: false }), false);
  assert.strictEqual(evidence.needed({ bool: true }), true);
  assert.strictEqual(evidence.needed({ option: 'none' }), true);
  assert.strictEqual(evidence.needed({ number: 0 }), true);
  assert.strictEqual(evidence.missing({ trust: 2, value: { bool: false } }), false);
  assert.strictEqual(evidence.missing({ trust: 1, value: { bool: false } }), false);
  assert.strictEqual(evidence.missing({ trust: 2, value: { bool: true } }), true);
  assert.strictEqual(evidence.missing({ trust: 2, value: { bool: true }, text: 'Telefonat 05.11.' }), false);
});

test('Auswahl mit 0 Punkten braucht keinen Beleg; Mehrfachauswahl nur, wenn alle gewählten 0 Punkte haben', () => {
  const s = { type: 'option', points: { hotel: 7, near: 3, none: 0, unknown_gym: 0 } };
  assert.strictEqual(evidence.needed({ option: 'none' }, s), false);
  assert.strictEqual(evidence.needed({ option: 'near' }, s), true);
  assert.strictEqual(evidence.needed({ option: 'gibt_es_nicht' }, s), true);
  assert.strictEqual(evidence.needed({ options: ['none', 'unknown_gym'] }, s), false);
  assert.strictEqual(evidence.needed({ options: ['none', 'near'] }, s), true);
  assert.strictEqual(evidence.needed({ options: [] }, s), true);
  assert.strictEqual(evidence.needed({ number: 0 }, { type: 'rating', min: 0, max: 5 }), true);
  assert.strictEqual(evidence.missing({ trust: 2, value: { option: 'none' }, scoring: s }), false);
  assert.strictEqual(evidence.missing({ trust: 2, value: { option: 'hotel' }, scoring: s }), true);
});
