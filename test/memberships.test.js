const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../src/services/memberships');

// Kandidaten-Regel wie im Fitness-Racing-Ranking (Werte aus einem anderen Ranking)
const rule = { min: 2, any: [
  { ranking: 'tri', criterion: 'rec_gym', values: ['athletic'], label: 'Kraftraum' },
  { ranking: 'tri', criterion: 'run_treadmill', values: ['incline'], label: 'Laufband mit Steigung' },
  { ranking: 'tri', criterion: 'rec_sauna', values: [true], label: 'Sauna' },
] };

test('candidateHits: zählt Treffer aus anderen Rankings, min entscheidet', () => {
  const facts = [
    { ranking_code: 'tri', criterion_code: 'rec_gym', value: { option: 'athletic' } },
    { ranking_code: 'tri', criterion_code: 'rec_sauna', value: { bool: true } },
    { ranking_code: 'tri', criterion_code: 'run_treadmill', value: { option: 'basic' } },
  ];
  const r = m.candidateHits(rule, facts);
  assert.deepEqual(r.hits, ['Kraftraum', 'Sauna']);
  assert.equal(r.match, true);
  assert.equal(m.candidateHits(rule, facts.slice(1)).match, false, 'nur Sauna');
});

test('candidateHits: Wert aus einem anderen Ranking mit gleichem Code zählt nicht', () => {
  const r = m.candidateHits(rule, [{ ranking_code: 'hyrox', criterion_code: 'rec_gym', value: { option: 'athletic' } }]);
  assert.equal(r.n, 0);
});

test('candidateHits: Mehrfachauswahl-Werte und fehlende Regel', () => {
  const multi = { min: 1, any: [{ ranking: 'tri', criterion: 'swim_pool', values: ['counter_current_hotel'] }] };
  assert.equal(m.candidateHits(multi, [{ ranking_code: 'tri', criterion_code: 'swim_pool', value: { option: 'pool_25_hotel', options: ['pool_25_hotel', 'counter_current_hotel'] } }]).match, true);
  assert.deepEqual(m.candidateHits(null, []), { hits: [], n: 0, match: false });
});

test('validateCandidateRule: Aufbau prüfen, leer ist erlaubt', () => {
  assert.deepEqual(m.validateCandidateRule(rule), []);
  assert.deepEqual(m.validateCandidateRule(null), []);
  assert.ok(m.validateCandidateRule({ any: [] }).length);
  assert.ok(m.validateCandidateRule({ any: [{ ranking: 'tri', criterion: 'x' }] }).length, 'values fehlt');
  assert.ok(m.validateCandidateRule({ min: 0, any: rule.any }).length, 'min < 1');
  assert.ok(m.validateCandidateRule([1, 2]).length, 'kein Objekt');
});
