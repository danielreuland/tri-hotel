const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../src/lib/features');

const catalog = [
  { id: 'f1', code: 'sauna', label: 'Sauna', group_label: 'Regeneration', sort_order: 51, filterable: true,
    derive: { ranking: 'triathlon-hotel', criterion: 'rec_sauna', values: [true] } },
  { id: 'f2', code: 'pool_50', label: '50-m-Becken im Hotel', group_label: 'Schwimmen', sort_order: 10, filterable: true,
    derive: { ranking: 'triathlon-hotel', criterion: 'swim_pool', values: ['pool_50_hotel'] } },
  { id: 'f3', code: 'vegan', label: 'Vegane Gerichte', group_label: 'Verpflegung', sort_order: 64, filterable: true, derive: null },
  { id: 'f4', code: 'parking', label: 'Parkplatz', group_label: 'Service', sort_order: 73, filterable: false, derive: null, active: false },
];

test('Leistungen werden aus Fakten abgeleitet, ohne doppelte Pflege', () => {
  assert.ok(lib.valueMatches({ bool: true }, [true]));
  assert.ok(!lib.valueMatches({ bool: false }, [true]));
  assert.ok(lib.valueMatches({ option: 'pool_50_hotel' }, ['pool_50_hotel']));
  assert.ok(!lib.valueMatches({ option: 'pool_25_hotel' }, ['pool_50_hotel']));
  assert.ok(!lib.valueMatches(null, [true]));

  const facts = [
    { ranking_code: 'triathlon-hotel', criterion_code: 'rec_sauna', value: { bool: true }, trust_level: 2 },
    { ranking_code: 'triathlon-hotel', criterion_code: 'swim_pool', value: { option: 'pool_25_hotel' }, trust_level: 2 },
    { ranking_code: 'rad-hotel', criterion_code: 'rec_sauna', value: { bool: false }, trust_level: 2 },
  ];
  const manual = [{ feature_id: 'f3', source: 'hotel', trust_level: 1 }, { feature_id: 'f4', source: 'admin', trust_level: 2 }];
  const list = lib.entityFeatures(catalog, facts, manual);
  assert.deepEqual(list.map((f) => f.code), ['sauna', 'vegan'], 'Katalog-Reihenfolge, 25-m-Becken ≠ 50-m, inaktive Leistung fehlt');
  assert.equal(list[0].derived, true);
  assert.equal(list[1].derived, false);
  assert.equal(list[1].trust_level, 1);
});

test('Leistungen werden nach Gruppe zusammengefasst', () => {
  const groups = lib.groupFeatures(lib.entityFeatures(catalog, [
    { ranking_code: 'triathlon-hotel', criterion_code: 'swim_pool', value: { option: 'pool_50_hotel' } },
    { ranking_code: 'triathlon-hotel', criterion_code: 'rec_sauna', value: { bool: true } },
  ], [{ feature_id: 'f3' }]));
  assert.deepEqual(groups.map((g) => g.label), ['Schwimmen', 'Regeneration', 'Verpflegung']);
});

test('Suchparameter werden begrenzt und geprüft', () => {
  const s = lib.parseSearch({ q: '  Mallorca ', land: 'es', min: '70', l: ['sauna', 'unbekannt', 'sauna'] }, { countries: ['ES', 'PT'], featureCodes: ['sauna', 'vegan'] });
  assert.deepEqual(s, { q: 'Mallorca', country: 'ES', minScore: 70, features: ['sauna'] });
  const bad = lib.parseSearch({ land: 'XX', min: '500', l: 'vegan' }, { countries: ['ES'], featureCodes: ['vegan'] });
  assert.deepEqual(bad, { q: '', country: null, minScore: null, features: ['vegan'] });
  assert.equal(lib.isActive({ q: '', country: null, minScore: null, features: [] }), false);
});

test('Suche filtert nach Text, Land, Mindest-Score und allen gewählten Leistungen', () => {
  const list = [
    { id: 'a', name: 'Hotel Mar Azul', city: 'Colònia de Sant Jordi', country: 'ES', score: 93 },
    { id: 'b', name: 'Sol de Lagos', city: 'Lagos', country: 'PT', score: 79 },
    { id: 'c', name: 'Costa Clara', city: 'Playitas', country: 'ES', score: 86 },
  ];
  const sets = new Map([['a', new Set(['sauna', 'pool_50'])], ['b', new Set(['sauna'])], ['c', new Set(['pool_50'])]]);
  const run = (s) => lib.applySearch(list, { q: '', country: null, minScore: null, features: [], ...s }, sets).map((e) => e.id);
  assert.deepEqual(run({ q: 'colonia' }), ['a'], 'ohne Akzente, Ort wird durchsucht');
  assert.deepEqual(run({ country: 'ES' }), ['a', 'c']);
  assert.deepEqual(run({ minScore: 85 }), ['a', 'c']);
  assert.deepEqual(run({ features: ['sauna', 'pool_50'] }), ['a'], 'alle Leistungen müssen vorhanden sein');
  assert.deepEqual(run({}), ['a', 'b', 'c'], 'Reihenfolge bleibt (nur nach Score)');
});
