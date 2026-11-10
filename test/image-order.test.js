const test = require('node:test');
const assert = require('node:assert/strict');
const order = require('../src/lib/image-order');

test('Bilder verschieben: hoch, runter, nach vorn; Ränder und unbekannte IDs bleiben unverändert', () => {
  const ids = ['a', 'b', 'c'];
  assert.deepEqual(order.move(ids, 'b', 'up'), ['b', 'a', 'c']);
  assert.deepEqual(order.move(ids, 'b', 'down'), ['a', 'c', 'b']);
  assert.deepEqual(order.move(ids, 'c', 'first'), ['c', 'a', 'b']);
  assert.deepEqual(order.move(ids, 'a', 'up'), ids);
  assert.deepEqual(order.move(ids, 'c', 'down'), ids);
  assert.deepEqual(order.move(ids, 'x', 'up'), ids);
  assert.deepEqual(order.move(ids, 'b', 'quer'), ids);
  assert.deepEqual(ids, ['a', 'b', 'c'], 'Eingabe bleibt unverändert');
});

test('Neue Bilder: ans Ende, als Hauptbild das erste neue nach vorn', () => {
  assert.deepEqual(order.append(['a', 'b'], ['n1', 'n2']), ['a', 'b', 'n1', 'n2']);
  assert.deepEqual(order.append(['a', 'b'], ['n1', 'n2'], true), ['n1', 'a', 'b', 'n2']);
  assert.deepEqual(order.append(['a'], [], true), ['a']);
});
