const test = require('node:test');
const assert = require('node:assert/strict');
const compare = require('../src/services/compare');

test('Vergleich: Adresse aus 2–3 verschiedenen Slugs', () => {
  assert.deepEqual(compare.parseCombo('playitas-hotel-vs-club-la-santa'), ['playitas-hotel', 'club-la-santa']);
  assert.deepEqual(compare.parseCombo('a-vs-b-vs-c'), ['a', 'b', 'c']);
  assert.equal(compare.parseCombo('a'), null, 'mindestens zwei');
  assert.equal(compare.parseCombo('a-vs-b-vs-c-vs-d'), null, 'höchstens drei');
  assert.equal(compare.parseCombo('a-vs-a'), null, 'keine Dopplung');
  assert.equal(compare.parseCombo('a-vs-B%20x'), null, 'nur gültige Slugs');
  assert.equal(compare.canonicalCombo(['zafiro', 'barcelo']), 'barcelo-vs-zafiro');
});

test('Vergleich: Unterschiede und bester Wert', () => {
  assert.equal(compare.differs(['ja', 'ja']), false);
  assert.equal(compare.differs(['ja', null]), true, 'unbekannt ist ein Unterschied');
  assert.deepEqual(compare.bestIndexes([5, 3, 5]), [0, 2]);
  assert.deepEqual(compare.bestIndexes([5, 5]), [], 'gleich: nichts hervorheben');
  assert.deepEqual(compare.bestIndexes([5, null]), [], 'nur ein bekannter Wert: nichts hervorheben');
});
