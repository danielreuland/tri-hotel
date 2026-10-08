const test = require('node:test');
const assert = require('node:assert/strict');
const geo = require('../src/services/geo');
const climate = require('../src/services/climate');
const extractor = require('../src/services/extractor');
const { slugify, websiteKey, normalizeUrl } = require('../src/lib/util');

test('geo.applyRule: Distanz-Optionen, fehlende Treffer, bool', () => {
  const open = { options: [{ within_km: 1, option: 'within_1km' }, { within_km: 5, option: 'within_5km' }], if_missing: 'none' };
  assert.deepEqual(geo.applyRule(open, { distanceKm: 0.4 }), { option: 'within_1km' });
  assert.deepEqual(geo.applyRule(open, { distanceKm: 3 }), { option: 'within_5km' });
  assert.deepEqual(geo.applyRule(open, null), { option: 'none' });

  const pool = { if_missing: 'none' };
  assert.equal(geo.applyRule(pool, { distanceKm: 2 }), null, 'Becken gefunden: Länge unbekannt, Admin entscheidet');
  assert.deepEqual(geo.applyRule(pool, null), { option: 'none' });

  const airport = { options: [{ within_km: 50, option: 'within_60min' }], if_missing: 'longer', if_unmatched: 'longer' };
  assert.deepEqual(geo.applyRule(airport, { distanceKm: 120 }), { option: 'longer' });

  const track = { bool_within_km: 5 };
  assert.deepEqual(geo.applyRule(track, { distanceKm: 4.9 }), { bool: true });
  assert.deepEqual(geo.applyRule(track, null), { bool: false });
});

test('geo: nur sichere Overpass-Selektoren', () => {
  assert.ok(geo.SELECTOR_RE.test('["leisure"="swimming_pool"]["access"!~"private"]'));
  assert.ok(geo.SELECTOR_RE.test('["aeroway"="aerodrome"]["iata"]'));
  assert.ok(!geo.SELECTOR_RE.test('["a"="b"];out;'));
  assert.ok(!geo.SELECTOR_RE.test('node(1)'));
});

test('geo.distanceKm', () => {
  const d = geo.distanceKm({ lat: 39.57, lng: 2.65 }, { lat: 39.55, lng: 2.73 }); // Palma -> Flughafen
  assert.ok(d > 6 && d < 8);
});

test('climate.aggregateMonthly mittelt Temperaturen und zählt Regentage je Jahr', () => {
  const daily = {
    time: ['2024-01-01', '2024-01-02', '2025-01-01', '2025-01-02'],
    temperature_2m_max: [10, 12, 14, null],
    temperature_2m_min: [2, 4, 6, 8],
    precipitation_sum: [0, 1.2, 5, 0.5],
  };
  const jan = climate.aggregateMonthly(daily)[0];
  assert.equal(jan.avg_high_c, 12);
  assert.equal(jan.avg_low_c, 5);
  assert.equal(jan.rain_days, 1); // 2 Regentage in 2 Jahren
  assert.equal(climate.aggregateMonthly(daily)[5].avg_high_c, null);
});

test('extractor.parseValue akzeptiert nur gültige Werte', () => {
  const opt = { scoring: { type: 'option', points: { a: 1, none: 0 } } };
  assert.deepEqual(extractor.parseValue(opt, 'a'), { option: 'a' });
  assert.equal(extractor.parseValue(opt, 'b'), null);
  assert.deepEqual(extractor.parseValue({ scoring: { type: 'bool' } }, 'false'), { bool: false });
  assert.deepEqual(extractor.parseValue({ scoring: { type: 'bands' } }, '25,5'), { number: 25.5 });
  assert.equal(extractor.parseValue({ scoring: { type: 'rating' } }, '5'), null, 'rating ist Admin-Einstufung');
  assert.equal(extractor.describeCriterion({ code: 'x', label: 'X', scoring: { type: 'climate' } }), null);
});

test('extractor.htmlToText entfernt Skripte und Tags', () => {
  const t = extractor.htmlToText('<p>Pool <b>25&nbsp;m</b></p><script>x()</script><div>Sauna</div>');
  assert.match(t, /Pool 25 m/);
  assert.ok(!t.includes('x()'));
});

test('util: slugify, websiteKey, normalizeUrl', () => {
  assert.equal(slugify('Hôtel Größe & Süd, Mallorca'), 'hotel-groesse-sued-mallorca');
  assert.equal(websiteKey('https://www.example.com/de/'), 'example.com');
  assert.equal(websiteKey('example.com'), 'example.com');
  assert.equal(normalizeUrl('example.com'), 'https://example.com/');
  assert.equal(normalizeUrl('javascript:alert(1)'), null);
});
