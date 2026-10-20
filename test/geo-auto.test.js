const test = require('node:test');
const assert = require('node:assert/strict');
const geo = require('../src/services/geo');

// Rechteck mit Seitenlängen in Metern um einen Punkt (für Beckengeometrien)
function rect(lengthM, widthM, lat = 47.0, lon = 13.0) {
  const dLat = lengthM / 111320;
  const dLon = widthM / (111320 * Math.cos((lat * Math.PI) / 180));
  return [{ lat, lon }, { lat: lat + dLat, lon }, { lat: lat + dLat, lon: lon + dLon }, { lat, lon: lon + dLon }, { lat, lon }];
}

test('poolLengthM: Tag length hat Vorrang, sonst aus der Geometrie (Diagonale × 0,9)', () => {
  assert.deepEqual(geo.poolLengthM({ tags: { length: '50 m' } }), { lengthM: 50, from: 'tag' });
  assert.deepEqual(geo.poolLengthM({ tags: { length: '25,0' } }), { lengthM: 25, from: 'tag' });
  const fifty = geo.poolLengthM({ tags: {}, geometry: rect(50, 25) });
  assert.equal(fifty.from, 'geometry');
  assert.ok(fifty.lengthM >= 48 && fifty.lengthM <= 52, String(fifty.lengthM));
  const twenty = geo.poolLengthM({ tags: {}, geometry: rect(20, 10) });
  assert.ok(twenty.lengthM < 23, `20-m-Becken darf nicht als 25 m gelten (${twenty.lengthM})`);
  assert.equal(geo.poolLengthM({ tags: {} }), null);
});

test('applyLengthRule: längste passende Klasse, dann das nächste Becken; nichts Passendes → kein Vorschlag', () => {
  const auto = { length_options: [{ min_m: 48, option: 'p50' }, { min_m: 23, option: 'p25' }] };
  const pools = [{ distanceKm: 0.5, lengthM: 25 }, { distanceKm: 3, lengthM: 50 }, { distanceKm: 1, lengthM: 51 }];
  const r = geo.applyLengthRule(auto, pools);
  assert.deepEqual(r.value, { option: 'p50' });
  assert.equal(r.hit.distanceKm, 1);
  assert.deepEqual(geo.applyLengthRule(auto, [{ distanceKm: 0.2, lengthM: 24 }]).value, { option: 'p25' });
  assert.equal(geo.applyLengthRule(auto, [{ distanceKm: 0.2, lengthM: 15 }]), null);
});

test('applyTerrainRule: nur eindeutige Fälle ergeben einen Vorschlag; info_only nie', () => {
  const flat = { reliefM: 20 };
  const hilly = { reliefM: 450 };
  const middle = { reliefM: 60 };
  assert.deepEqual(geo.applyTerrainRule({ relief_max_m: 30 }, flat), { bool: true });
  assert.equal(geo.applyTerrainRule({ relief_max_m: 30 }, middle), null, 'kein „nein“ – eine flache Runde kann es trotzdem geben');
  assert.deepEqual(geo.applyTerrainRule({ relief_min_m: 120 }, hilly), { bool: true });
  assert.equal(geo.applyTerrainRule({ relief_min_m: 120 }, middle), null);
  assert.equal(geo.applyTerrainRule({ info_only: true, relief_max_m: 30 }, flat), null);
  assert.equal(geo.applyTerrainRule({ relief_max_m: 30 }, null), null);
});

test('evaluateRule: unbekannte Quelle → kein Vorschlag', async () => {
  assert.equal(await geo.evaluateRule({ lat: 0, lng: 0 }, { source: 'unbekannt' }), null);
});
