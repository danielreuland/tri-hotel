const test = require('node:test');
const assert = require('node:assert/strict');
const home = require('../src/services/home');

const ranked = [
  { id: 'a', score: 90, partner: false },
  { id: 'b', score: 88, partner: true },
  { id: 'c', score: 79 },
  { id: 'd', score: 75 },
  { id: 'e', score: 74 },
  { id: 'f', score: null },
];

test('heroPick: nur Score ab 75, ohne das Objekt aus der Bestenliste, täglich wechselnd', () => {
  const day = (d) => new Date(Date.UTC(2026, 10, d));
  const picks = [1, 2, 3, 4].map((d) => home.heroPick(ranked, 'a', day(d)).entity.id);
  assert.deepEqual([...new Set(picks)].sort(), ['b', 'c', 'd'], 'a ausgeschlossen, e (74) und f (ohne Score) nie');
  assert.equal(home.heroPick(ranked, 'a', day(1)).candidates, 3);
  assert.equal(home.heroPick(ranked, 'a', day(1)).entity.id, home.heroPick(ranked, 'a', day(1)).entity.id, 'am selben Tag stabil');
  assert.notEqual(home.heroPick(ranked, 'a', day(1)).entity.id, home.heroPick(ranked, 'a', day(2)).entity.id, 'am nächsten Tag ein anderes');
});

test('heroPick: ohne passende Objekte keine Karte', () => {
  assert.equal(home.heroPick([{ id: 'x', score: 60 }]), null);
  assert.equal(home.heroPick([]), null);
});
