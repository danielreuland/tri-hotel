const test = require('node:test');
const assert = require('node:assert/strict');
const bike = require('../src/services/bike-area');

const rule = { tile_deg: 0.25, tile_radius_km: 20, region_radius_km: [15, 40], network_km: [150, 400], quiet_share: [0.6, 0.8], routes: [1, 5],
  climb_m: 300, flat_share: 0.2, flat_band_m: 50, hotel_radius_km: 2, hotel_min_quiet_km: 3, max: { network: 2, traffic: 1, terrain: 2, routes: 1 } };
const mallorca = { id: 'r1', name: 'Mallorca', lat: 39.6, lng: 2.95, radius_km: 70 };

test('areaFor: Hotels in einer Region teilen sich das Gebiet; Radius auf 15–40 km begrenzt', () => {
  const a = bike.areaFor({ lat: 39.84, lng: 3.12 }, [mallorca], rule);
  const b = bike.areaFor({ lat: 39.57, lng: 2.65 }, [mallorca], rule);
  assert.equal(a.key, 'region:r1');
  assert.equal(b.key, a.key);
  assert.equal(a.radiusKm, 40);
});

test('areaFor: ohne Region dieselbe Kachel für nahe Hotels, andere Kachel weiter weg', () => {
  const a = bike.areaFor({ lat: 47.80, lng: 13.30 }, [], rule);
  const b = bike.areaFor({ lat: 47.79, lng: 13.31 }, [], rule);
  const c = bike.areaFor({ lat: 47.30, lng: 12.76 }, [], rule);
  assert.equal(a.key, b.key);
  assert.notEqual(a.key, c.key);
  assert.equal(a.lat, 47.875);
  assert.equal(a.radiusKm, 20);
});

// Weg mit zwei Punkten im Abstand von ca. km Kilometern (Nord-Süd)
const way = (highway, km, extra = {}) => ({ type: 'way', tags: { highway, ...extra }, geometry: [{ lat: 40, lon: 3 }, { lat: 40 + km / 111.2, lon: 3 }] });

test('roadMetrics: ruhige Straßen nur asphaltiert, Anteil und Radrouten', () => {
  const m = bike.roadMetrics([way('tertiary', 100), way('unclassified', 50, { surface: 'gravel' }), way('secondary', 40), way('primary', 60), { type: 'relation', id: 1 }, { type: 'relation', id: 2 }]);
  assert.equal(m.quietKm, 100);
  assert.equal(m.networkKm, 120);
  assert.equal(m.mainKm, 60);
  assert.equal(m.routes, 2);
  assert.equal(m.quietShare, 0.5);
});

test('terrainMetrics: flache Täler in jeder Höhe zählen (Nachbarvergleich), Meer zählt nicht', () => {
  const grid = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) grid.push({ i, j, e: i < 2 ? 600 : 600 + j * 300 }); // obere Hälfte flach auf 600 m
  grid.push({ i: 4, j: 0, e: null });
  const t = bike.terrainMetrics(grid, rule);
  assert.equal(t.minM, 600);
  assert.equal(t.maxM, 1500);
  assert.ok(t.flatShare >= 0.4, String(t.flatShare));
  assert.equal(bike.terrainMetrics([{ i: 0, j: 0, e: null }], rule), null);
});

test('subscores + areaScore: Schwellen aus der Regel, Übersteuerung einzelner Teilwertungen', () => {
  const sub = bike.subscores({ roads: { networkKm: 500, quietShare: 0.7, routes: 3 }, terrain: { flatShare: 0.3, reliefM: 800 } }, rule);
  assert.deepEqual(sub, { network: 2, traffic: 0.5, terrain: 2, routes: 0.5 });
  assert.equal(bike.areaScore(sub).score, 5);
  const o = bike.areaScore(sub, { traffic: 0, note: 'Saisonverkehr' });
  assert.equal(o.merged.traffic, 0);
  assert.equal(o.score, 4.5);
  assert.equal(bike.subscores({ roads: { networkKm: 100, quietShare: 0.3, routes: 0 }, terrain: null }, rule).terrain, null);
});

test('hotelAdjust: kaum ruhige Straßen am Hotel → −1, sonst 0', () => {
  assert.equal(bike.hotelAdjust(1.2, rule).value, -1);
  assert.match(bike.hotelAdjust(1.2, rule).reason, /1,?2|1.2/);
  assert.equal(bike.hotelAdjust(8, rule).value, 0);
  assert.equal(bike.hotelAdjust(null, rule).value, 0);
});
