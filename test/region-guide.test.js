const test = require('node:test');
const assert = require('node:assert/strict');
const guide = require('../src/services/region-guide');
const { MONTHS } = require('../src/lib/util');

const clim = (high, rain, extra = {}) => Array.from({ length: 12 }, (_, i) => ({ month: i + 1, avg_high_c: high[i], rain_days: rain[i], sunshine_h: null, wind_kmh: null, sea_c: null, ...extra }));
const flat = (v) => Array(12).fill(v);
const formula = { best_time: { metric: 'avg_high_c', min: 16, max: 28 } };

test('Regionen: Eignung im Monat – zuerst beste Reisezeit, dann wenige Regentage', () => {
  const rows = [
    { name: 'Heiß', sort_order: 1, climate: clim(flat(32), flat(0)) },
    { name: 'Nass', sort_order: 2, climate: clim(flat(20), flat(12)) },
    { name: 'Trocken', sort_order: 3, climate: clim(flat(22), flat(2)) },
  ];
  assert.deepEqual(guide.sortRegions(rows, { month: 7, formula }).map((r) => r.name), ['Trocken', 'Nass', 'Heiß']);
  // ohne Monat: Reihenfolge der Redaktion
  assert.deepEqual(guide.sortRegions(rows, { formula }).map((r) => r.name), ['Heiß', 'Nass', 'Trocken']);
});

test('Regionen: andere Rankings – Bereich der besten Reisezeit kommt aus der Formel', () => {
  const rows = [
    { name: 'Kühl', sort_order: 1, climate: clim(flat(8), flat(5)) },
    { name: 'Mild', sort_order: 2, climate: clim(flat(18), flat(5)) },
  ];
  const ski = { best_time: { metric: 'avg_high_c', max: 10 } };
  assert.deepEqual(guide.sortRegions(rows, { month: 1, formula: ski }).map((r) => r.name), ['Kühl', 'Mild']);
  assert.match(guide.sortText('standard', guide.parsePeriod(1, MONTHS), ski), /bis 10 °C/);
  assert.match(guide.sortText('standard', guide.parsePeriod('winter', MONTHS), formula), /meisten Monaten im Winter/);
});

test('Regionen: Sortierung nach Wasser – Binnenregionen (ohne Wert) am Ende, Jahresmittel ohne Monat', () => {
  const rows = [
    { name: 'Binnen', sort_order: 1, climate: clim(flat(20), flat(5)) },
    { name: 'Kalt', sort_order: 2, climate: clim(flat(20), flat(5), { sea_c: 17 }) },
    { name: 'Warm', sort_order: 3, climate: clim(flat(20), flat(5), { sea_c: 23 }) },
  ];
  assert.deepEqual(guide.sortRegions(rows, { sort: 'wasser', month: 8 }).map((r) => r.name), ['Warm', 'Kalt', 'Binnen']);
  assert.deepEqual(guide.sortRegions(rows, { sort: 'wasser' }).map((r) => r.name), ['Warm', 'Kalt', 'Binnen']);
  assert.equal(guide.monthValue(rows[1].climate, 'sea_c', null), 17);
  assert.deepEqual(guide.yearRange(clim([10, 12, 30, 14, 15, 16, 17, 18, 19, 20, 21, 22], flat(1)), 'avg_high_c'), { min: 10, max: 30 });
});

test('Regionen: Radrevier sortiert absteigend, ohne Bewertung am Ende', () => {
  const rows = [
    { name: 'Ohne', sort_order: 1, climate: [], bike: null },
    { name: 'Gut', sort_order: 2, climate: [], bike: { score: 5 } },
    { name: 'Mittel', sort_order: 3, climate: [], bike: { score: 3.5 } },
  ];
  assert.deepEqual(guide.sortRegions(rows, { sort: 'rad' }).map((r) => r.name), ['Gut', 'Mittel', 'Ohne']);
});

test('Regionen: Vergleichs-URL', () => {
  assert.deepEqual(guide.parsePair('mallorca-vs-gran-canaria'), ['mallorca', 'gran-canaria']);
  assert.deepEqual(guide.parsePair('a-vs-a-vs-b-vs-c-vs-d'), ['a', 'b', 'c']);
  assert.deepEqual(guide.parsePair('x<y>-vs-b'), ['b']);
  assert.equal(guide.pairSlug(['a', 'b']), 'a-vs-b');
  assert.deepEqual(guide.bikeFacts({ score: '3.5', metrics: { roads: { quietKm: 1393, passes: 48 }, terrain: { reliefM: 1625 } } }),
    { score: 3.5, quietKm: 1393, passes: 48, reliefM: 1625, routes: null, computedAt: undefined });
  assert.equal(guide.bikeFacts({ score: null }), null);
});

test('Regionen: Jahreszeit – Eignung zählt Monate in der besten Reisezeit, Werte als Mittel der Monate', () => {
  const { MONTHS: M } = require('../src/lib/util');
  const hi = (w) => Array.from({ length: 12 }, (_, i) => ([12, 1, 2].includes(i + 1) ? w : 25));
  const rows = [
    { name: 'Kalt', sort_order: 1, climate: clim(hi(10), flat(2)) },
    { name: 'Mild', sort_order: 2, climate: clim(hi(18), flat(4)) },
  ];
  const p = guide.parsePeriod('winter', M);
  assert.deepEqual(p.months, [12, 1, 2]);
  assert.equal(p.label, 'im Winter');
  assert.deepEqual(guide.sortRegions(rows, { month: p.months, formula }).map((r) => r.name), ['Mild', 'Kalt']);
  assert.equal(guide.monthValue(clim([10, 20, 30, 0, 0, 0, 0, 0, 0, 0, 0, 40], flat(1)), 'avg_high_c', [12, 1, 2]), 23.3);
  assert.equal(guide.parsePeriod('quatsch', M), null);
  assert.equal(guide.parsePeriod('3', M).label, 'im März');
});

test('Klimapunkt: Admin vor Hotels vor tiefem Ort nahe der Mitte, nie der Gipfel', () => {
  const rd = require('../src/services/region-data');
  const center = { lat: 28.29, lng: -16.62 };
  assert.deepEqual(rd.pickClimatePoint(center, { override: { lat: 28.1, lng: -16.7 } }), { lat: 28.1, lng: -16.7, source: 'admin', place: null });
  const hotels = [{ lat: 28.10, lng: -16.75, city: 'Costa Adeje' }, { lat: 28.11, lng: -16.74, city: 'Adeje' }, { lat: 28.40, lng: -16.55, city: 'Puerto de la Cruz' }];
  const h = rd.pickClimatePoint(center, { hotels });
  assert.equal(h.source, 'hotels');
  assert.ok(['Costa Adeje', 'Adeje'].includes(h.place), 'Medoid liegt im Süden, wo die meisten Hotels sind');
  const samples = [
    { lat: 28.29, lng: -16.62, elevation: 2345 },
    { lat: 28.20, lng: -16.62, elevation: 900 },
    { lat: 28.10, lng: -16.62, elevation: 120 },
    { lat: 28.00, lng: -16.62, elevation: 15 },
    { lat: 27.95, lng: -16.62, elevation: 0 },
  ];
  const a = rd.pickClimatePoint(center, { samples });
  assert.deepEqual([a.source, a.lat], ['auto', 28.10], 'nächster Ort bis 400 m, nicht das Meer und nicht der Gipfel');
  const high = rd.pickClimatePoint(center, { samples: [{ lat: 1, lng: 1, elevation: 1500 }, { lat: 2, lng: 2, elevation: 900 }] });
  assert.equal(high.lat, 2, 'ohne Ort bis 400 m: tiefster Landpunkt');
  assert.equal(rd.pickClimatePoint(center, {}).source, 'center');
  assert.equal(rd.climatePointText({ place: 'Costa Adeje', elevation_m: 30, source: 'hotels' }), 'Costa Adeje, 30 m, Lage der Hotels');
});
