const test = require('node:test');
const assert = require('node:assert/strict');
const home = require('../src/services/home');

const ranked = [
  { id: 'a', score: 90 },
  { id: 'b', score: 88, partner: true },
  { id: 'c', score: 79 },
  { id: 'd', score: 75 },
  { id: 'e', score: 74 },
  { id: 'f', score: null },
];

test('heroSlides: alle Objekte ab Score 75 in Ranking-Reihenfolge, Partner ohne Sonderrolle', () => {
  const r = home.heroSlides(ranked, new Date(Date.UTC(2026, 10, 1)));
  assert.deepEqual(r.slides.map((e) => e.id), ['a', 'b', 'c', 'd']);
  assert.ok(r.start >= 0 && r.start < 4);
});

test('heroSlides: täglich anderer Start, am selben Tag stabil', () => {
  const day = (d) => new Date(Date.UTC(2026, 10, d));
  const starts = [1, 2, 3, 4].map((d) => home.heroSlides(ranked, day(d)).start);
  assert.equal(new Set(starts).size, 4, 'vier Tage, vier Startpunkte');
  assert.equal(home.heroSlides(ranked, day(1)).start, home.heroSlides(ranked, day(1)).start);
});

test('heroSlides: ohne passende Objekte kein Slider', () => {
  assert.equal(home.heroSlides([{ id: 'x', score: 60 }]), null);
  assert.equal(home.heroSlides([]), null);
});
