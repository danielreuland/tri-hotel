const test = require('node:test');
const assert = require('node:assert/strict');
const finder = require('../src/lib/finder');

const clim = (rows) => rows.map(([month, high, rain]) => ({ month, avg_high_c: high, rain_days: rain }));
const hotels = [
  { id: 'lanzarote', bestMonths: [1, 2, 3, 11, 12], climate: clim([[1, 21, 3], [3, 23, 2], [7, 29, 0]]) },
  { id: 'mallorca', bestMonths: [3, 4, 5, 10], climate: clim([[1, 15, 6], [3, 18, 5], [7, 30, 1]]) },
  { id: 'allgaeu', bestMonths: [6, 7, 8], climate: clim([[1, 2, 10], [3, 9, 9], [7, 23, 12]]) },
  { id: 'ohne-klima', bestMonths: [], climate: [] },
];
const ids = (list) => list.map((e) => e.id);

test('parseTrip: Wetter und Regen nur mit gültigem Monat', () => {
  assert.deepEqual(finder.parseTrip({ monat: '3', wetter: 'mild', regen: '1' }), { month: 3, weather: 'mild', lowRain: true });
  assert.deepEqual(finder.parseTrip({ wetter: 'warm', regen: '1' }), { month: null, weather: null, lowRain: false });
  assert.deepEqual(finder.parseTrip({ monat: '13', wetter: 'warm' }), { month: null, weather: null, lowRain: false });
  assert.equal(finder.parseTrip({ monat: '1', wetter: 'tropisch' }).weather, null);
});

test('filterTrip: ohne Wetter gute Reisezeit, mit Wetter Klima im Monat (Grenzen einschließlich), unbekannt passt nicht', () => {
  assert.deepEqual(ids(finder.filterTrip(hotels, { month: null })), ['lanzarote', 'mallorca', 'allgaeu', 'ohne-klima']);
  assert.deepEqual(ids(finder.filterTrip(hotels, { month: 3 })), ['lanzarote', 'mallorca']);
  assert.deepEqual(ids(finder.filterTrip(hotels, { month: 3, weather: 'mild' })), ['lanzarote', 'mallorca'], '23 und 18 °C');
  assert.deepEqual(ids(finder.filterTrip(hotels, { month: 1, weather: 'mild' })), ['lanzarote']);
  assert.deepEqual(ids(finder.filterTrip(hotels, { month: 7, weather: 'warm' })), ['lanzarote', 'mallorca']);
  assert.deepEqual(ids(finder.filterTrip(hotels, { month: 7, weather: 'mild' })), ['allgaeu']);
  assert.deepEqual(ids(finder.filterTrip(hotels, { month: 3, weather: 'mild', lowRain: true })), ['lanzarote'], 'Mallorca hat 5 Regentage');
  assert.deepEqual(ids(finder.filterTrip(hotels, { month: 1, lowRain: true })), ['lanzarote'], 'nur Regen, Wetter egal');
});

test('toQuery und relaxations: je ein Filter gelockert, Monat nimmt Wetter mit', () => {
  const search = { q: '', country: 'ES', minScore: null, features: ['pool_50', 'bike_storage'] };
  const trip = { month: 3, weather: 'warm', lowRain: true };
  assert.equal(finder.toQuery(search, trip), 'land=ES&monat=3&wetter=warm&regen=1&l=pool_50&l=bike_storage');
  const r = finder.relaxations(search, trip, { featureLabel: (c) => c.toUpperCase(), monthName: () => 'März' });
  assert.deepEqual(r.map((x) => x.label), ['ohne „POOL_50“', 'ohne „BIKE_STORAGE“', 'Wetter egal (nur gute Reisezeit im März)', 'auch mit mehr Regen', 'jeder Reisemonat', 'alle Länder']);
  assert.deepEqual(r[4].trip, { month: null, weather: null, lowRain: false });
  assert.deepEqual(r[0].search.features, ['bike_storage']);
});
