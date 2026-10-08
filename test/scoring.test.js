const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('../src/services/scoring');

// --- Fixtures: Auszug aus dem Triathlon-Seed ---
const tri = [
  { id: 'pool', code: 'swim_pool', label: 'Becken', max_points: 15, is_ko: true,
    scoring: { type: 'option', points: { pool_50_hotel: 15, pool_25_hotel: 10, pool_25_within_5km: 5, none: 0 }, ko: ['none'],
      labels: { none: 'kein Becken ≤ 5 km' } } },
  { id: 'heated', code: 'swim_heated', label: 'Beheizt', max_points: 3, scoring: { type: 'bool', points_true: 3 } },
  { id: 'terrain', code: 'bike_terrain', label: 'Radrevier', max_points: 6, scoring: { type: 'rating', min: 0, max: 6 } },
  { id: 'storage', code: 'bike_storage', label: 'Radgarage', max_points: 6,
    scoring: { type: 'option', points: { lockable_cctv: 6, lockable: 4, none: 0 } } },
  { id: 'temp', code: 'log_climate', label: 'Klima', max_points: 4,
    scoring: { type: 'climate', metric: 'avg_high_c', bands: [
      { min: 15, max: 30, points: 4 }, { min: 12, max: 14.9, points: 2 }, { min: 30.1, max: 34, points: 2 }] } },
  { id: 'rain', code: 'log_rain', label: 'Regentage', max_points: 1,
    scoring: { type: 'climate', metric: 'rain_days', bands: [{ min: 0, max: 4.9, points: 1 }] } },
];
const triFormula = { fact_weight: 0.6, athlete_weight: 0.4, bayes_c: 5, bayes_m: 70, min_completeness: 70 };
const triLabels = [
  { min: 85, label: 'Top-Trainingshotel' }, { min: 70, label: 'Sehr gut geeignet' },
  { min: 55, label: 'Geeignet' }, { min: 0, label: 'Eingeschränkt geeignet' }];

const climate = [
  { month: 1, avg_high_c: '13.0', rain_days: '8.0' },  // 2 + 0
  { month: 4, avg_high_c: '21.5', rain_days: '3.0' },  // 4 + 1  -> bester Monat
  { month: 8, avg_high_c: '33.0', rain_days: '0.5' },  // 2 + 1
];

// --- Zweites Ranking: Hyrox-Gyms, ganz andere Kriterien ---
const hyrox = [
  { id: 'sled', code: 'sled_track', label: 'Schlittenbahn', max_points: 10, is_ko: true,
    scoring: { type: 'option', points: { m25plus: 10, m10to25: 5, none: 0 }, ko: ['none'] } },
  { id: 'ski', code: 'skierg', label: 'SkiErg vorhanden', max_points: 5, scoring: { type: 'bool', points_true: 5 } },
  { id: 'area', code: 'area_m2', label: 'Trainingsfläche', max_points: 8,
    scoring: { type: 'bands', unit: 'm²', bands: [{ min: 300, points: 8 }, { min: 150, max: 299.9, points: 4 }] } },
];

test('option, bool, rating und climate ergeben Punkte', () => {
  assert.deepEqual(s.pointsFor(tri[0], { option: 'pool_25_hotel' }).points, 10);
  assert.equal(s.pointsFor(tri[1], { bool: true }).points, 3);
  assert.equal(s.pointsFor(tri[1], { bool: false }).points, 0);
  assert.equal(s.pointsFor(tri[2], { number: 9 }).points, 6, 'rating wird auf max begrenzt');
  assert.equal(s.pointsFor(tri[2], { number: -2 }).points, 0, 'rating wird auf min begrenzt');
  assert.equal(s.pointsFor(tri[4], null, { avg_high_c: 31 }).points, 2);
  assert.equal(s.pointsFor(tri[4], null, { avg_high_c: 40 }).points, 0, 'außerhalb aller Bänder = 0');
});

test('fehlende oder ungültige Werte gelten als unbekannt', () => {
  assert.equal(s.pointsFor(tri[0], undefined).known, false);
  assert.equal(s.pointsFor(tri[1], { bool: 'ja' }).known, false);
  const bad = s.pointsFor(tri[0], { option: 'pool_100' });
  assert.equal(bad.known, false);
  assert.equal(bad.invalid, true);
  assert.equal(s.pointsFor(tri[4], null, null).known, false);
});

test('F wird auf die bekannten Kriterien normiert', () => {
  const facts = { pool: { option: 'pool_50_hotel' }, heated: { bool: false } }; // 15 von 18
  const r = s.computeScore(tri, facts, [], { formula: triFormula, labels: triLabels });
  assert.equal(r.factScore, 83.33);
  assert.equal(r.score, 83);
  assert.equal(r.maxKnown, 18);
  assert.equal(r.maxAll, 35);
  assert.equal(r.completeness, 51.43);
  assert.equal(r.eligible, false, 'unter 70 % Vollständigkeit nicht im Ranking');
  assert.equal(r.provisional, true, 'ohne Bewertungen vorläufig');
  assert.equal(r.label, 'Sehr gut geeignet');
});

test('ohne Monat zählt der beste Klimamonat, mit Monat genau dieser', () => {
  const facts = {
    pool: { option: 'pool_50_hotel' }, heated: { bool: true }, terrain: { number: 6 }, storage: { option: 'lockable_cctv' },
  };
  const best = s.computeScore(tri, facts, climate, { formula: triFormula, labels: triLabels });
  assert.equal(best.month, 4);
  assert.equal(best.score, 100);
  assert.equal(best.completeness, 100);
  assert.equal(best.eligible, true);

  const jan = s.computeScore(tri, facts, climate, { month: 1, formula: triFormula, labels: triLabels });
  assert.equal(jan.month, 1);
  assert.equal(jan.pointsKnown, 32); // 30 + 2 + 0
  assert.equal(jan.score, 91);

  const noData = s.computeScore(tri, facts, climate, { month: 6, formula: triFormula });
  assert.equal(noData.maxKnown, 30, 'Monat ohne Klimadaten: Klima-Kriterien unbekannt');
});

test('K.O.-Regel: kein Score, Begründung mit lesbarem Wert', () => {
  const r = s.computeScore(tri, { pool: { option: 'none' }, heated: { bool: true } }, climate, { formula: triFormula });
  assert.equal(r.ko, true);
  assert.equal(r.score, null);
  assert.equal(r.eligible, false);
  assert.equal(r.koReason, 'Becken: kein Becken ≤ 5 km');
});

test('Nicht-K.O.-Kriterium mit 0 Punkten löst kein K.O. aus', () => {
  const r = s.computeScore(tri, { pool: { option: 'pool_25_hotel' }, storage: { option: 'none' } }, [], {});
  assert.equal(r.ko, false);
  assert.equal(r.score, 48); // 10 von 21 Punkten = 47,6 %
});

test('Gesamtscore mit Athleten-Score nutzt die Gewichte aus der Formel', () => {
  const facts = { pool: { option: 'pool_50_hotel' }, heated: { bool: true }, terrain: { number: 6 }, storage: { option: 'lockable_cctv' } };
  const r = s.computeScore(tri, facts, climate, { formula: triFormula, athleteScore: 50, reviewCount: 4 });
  assert.equal(r.score, 80); // 0,6*100 + 0,4*50
  assert.equal(r.provisional, false);
  const other = s.computeScore(tri, facts, climate, { formula: { ...triFormula, fact_weight: 0.5, athlete_weight: 0.5 }, athleteScore: 50, reviewCount: 4 });
  assert.equal(other.score, 75);
  const few = s.computeScore(tri, facts, climate, { formula: triFormula, athleteScore: 50, reviewCount: 2 });
  assert.equal(few.provisional, true, 'unter 3 Bewertungen vorläufig');
});

test('Athleten-Score: Bayes-Mittel mit Altersgewichtung', () => {
  assert.equal(s.computeAthleteScore([], triFormula), null);
  // (5*70 + 1*100) / (5+1) = 75
  assert.equal(s.computeAthleteScore([{ score: 100, ageMonths: 3 }], triFormula), 75);
  // Gewicht 0,7: (350 + 70) / 5,7 = 73,68
  assert.equal(s.computeAthleteScore([{ score: 100, ageMonths: 18 }], triFormula), 73.68);
  // älter als 36 Monate zählt nicht
  assert.equal(s.computeAthleteScore([{ score: 0, ageMonths: 40 }], triFormula), 70);
  assert.equal(s.starsToScore(1), 0);
  assert.equal(s.starsToScore(5), 100);
});

test('Labels kommen aus der Ranking-Definition', () => {
  assert.equal(s.labelFor(85, triLabels), 'Top-Trainingshotel');
  assert.equal(s.labelFor(84, triLabels), 'Sehr gut geeignet');
  assert.equal(s.labelFor(10, triLabels), 'Eingeschränkt geeignet');
  assert.equal(s.labelFor(null, triLabels), null);
});

test('zweites Ranking (Hyrox) funktioniert ohne Code-Änderung', () => {
  const labels = [{ min: 80, label: 'Wettkampf-Gym' }, { min: 0, label: 'Basis' }];
  const formula = { min_completeness: 50 };
  const r = s.computeScore(hyrox, { sled: { option: 'm25plus' }, ski: { bool: true }, area: { number: 200 } }, [], { formula, labels });
  assert.equal(r.score, 83); // 19 von 23
  assert.equal(r.label, 'Wettkampf-Gym');
  assert.equal(r.eligible, true);
  assert.equal(r.month, null, 'ohne Klima-Kriterien kein Monat');

  const ko = s.computeScore(hyrox, { sled: { option: 'none' } }, [], { formula, labels });
  assert.equal(ko.ko, true);
  assert.equal(ko.koReason, 'Schlittenbahn: none');

  const small = s.computeScore(hyrox, { sled: { option: 'm10to25' }, area: { number: 100 } }, [], { formula });
  assert.equal(small.pointsKnown, 5, 'Band ohne Treffer = 0 Punkte');
});

test('inaktive Kriterien zählen nicht', () => {
  const crit = [...hyrox.slice(0, 2), { ...hyrox[2], active: false }];
  const r = s.computeScore(crit, { sled: { option: 'm25plus' }, ski: { bool: true } }, [], {});
  assert.equal(r.maxAll, 15);
  assert.equal(r.completeness, 100);
});

test('validateCriterion prüft Typ, Schema und Punktesumme', () => {
  assert.deepEqual(s.validateCriterion({ value_type: 'option', scoring: tri[0].scoring, max_points: 15 }), { errors: [], warnings: [] });
  assert.equal(s.validateCriterion({ value_type: 'bool', scoring: tri[0].scoring, max_points: 15 }).errors.length, 1);
  assert.match(s.validateCriterion({ value_type: 'option', scoring: { type: 'option', points: { a: 1 }, ko: ['b'] }, max_points: 1 }).errors[0], /K\.O\./);
  assert.equal(s.validateCriterion({ value_type: 'number', scoring: { type: 'climate', metric: 'wind', bands: [{ points: 1 }] }, max_points: 1 }).errors.length, 1);
  const w = s.validateCriterion({ value_type: 'rating', scoring: { type: 'rating', min: 0, max: 6 }, max_points: 5 });
  assert.equal(w.errors.length, 0);
  assert.equal(w.warnings.length, 1);
  assert.equal(s.validateCriterion({ value_type: 'option', scoring: null }).errors.length, 1);
});

test('describeValue liefert lesbare Werte', () => {
  assert.equal(s.describeValue(tri[0], { option: 'none' }), 'kein Becken ≤ 5 km');
  assert.equal(s.describeValue(tri[0], { option: 'pool_50_hotel' }), 'pool_50_hotel', 'ohne Label: Schlüssel');
  assert.equal(s.describeValue(tri[1], { bool: true }), 'ja');
  assert.equal(s.describeValue(tri[2], { number: 4 }), '4 von 6');
  assert.equal(s.describeValue(tri[5], null, { rain_days: 3 }), '3 Regentage');
  assert.equal(s.describeValue(hyrox[2], { number: 250 }), '250 m²');
});
