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
    { score: 3.5, quietKm: 1393, networkKm: null, quietShare: null, passes: 48, passMaxM: null, reliefM: 1625, flatShare: null, routes: null, computedAt: undefined });
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
  assert.notEqual(rd.pickClimatePoint(center, { hotels: hotels.slice(0, 2) }).source, 'hotels', 'zwei Hotels reichen nicht');
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

test('Regionsseite: Radrevier in Worten', () => {
  const t = guide.bikeText({ score: 3.5, quietKm: 1389, quietShare: 0.58, passes: 47, passMaxM: 1790, reliefM: 1625, flatShare: 0.08, routes: 17 });
  assert.equal(t[0], 'Gelände bergig: 1.625 m Höhenunterschied im Gebiet.');
  assert.equal(t[1], '47 Pässe in OpenStreetMap, der höchste auf 1.790 m.');
  assert.equal(t[2], 'Rund 1.389 km ruhige Nebenstraßen – 58 % des Straßennetzes.');
  assert.equal(t[3], '17 ausgeschilderte Radrouten.');
  assert.match(guide.bikeText({ reliefM: 120, quietKm: null, passes: 0, routes: 0 })[0], /überwiegend flach/);
  assert.match(guide.bikeText({ reliefM: 1200, flatShare: 0.4, quietKm: null })[0], /bergig, mit flachen Abschnitten/);
  assert.deepEqual(guide.bikeText(null), []);
});

test('Regionsseite: beste Reisezeit mit Begründung aus formula.best_time', () => {
  const { MONTHS: M } = require('../src/lib/util');
  const highs = [15, 16, 18, 20, 23, 29, 32, 31, 28, 24, 22, 18];
  const rain = [9, 12, 9, 8, 8, 1, 0, 2, 6, 3, 6, 11];
  const climate = highs.map((h, i) => ({ month: i + 1, avg_high_c: h, rain_days: rain[i], sunshine_h: i === 6 ? 13 : 9, wind_kmh: i === 7 ? 25 : 15, windy_days: i === 7 ? 4 : 1, sea_c: i === 7 ? 26 : i === 1 ? 16 : 20 }));
  const r = guide.bestTimeReasons(climate, { best_time: { metric: 'avg_high_c', min: 16, max: 28 } }, M);
  assert.equal(r.rule, 'Monate mit Ø Höchsttemperatur zwischen 16 und 28 °C');
  assert.equal(r.best, 'Februar–Mai, September–Dezember');
  assert.deepEqual(r.outside, ['Juni–August darüber (bis 32 °C)', 'Januar darunter (ab 15 °C)']);
  assert.ok(r.notes.includes('Am meisten Regen im Februar (12 Regentage), am wenigsten im Juli (0).'));
  assert.ok(r.notes.includes('Am windigsten im August (Ø 25 km/h, 4 Tage mit Sturmböen).'));
  assert.ok(r.notes.includes('Wasser am wärmsten im August (26 °C), am kühlsten im Februar (16 °C).'));
  const none = guide.bestTimeReasons(climate, {}, M);
  assert.equal(none.rule, null, 'ohne Regel im Ranking keine Reisezeit-Begründung, nur Auffälligkeiten');
  assert.ok(none.notes.length >= 3);
  assert.deepEqual(guide.bestTimeReasons([], {}, M), { rule: null, best: null, outside: [], notes: [] });
  const close = guide.bestTimeReasons([{ month: 1, avg_high_c: 15.6 }, { month: 2, avg_high_c: 20 }], { best_time: { metric: 'avg_high_c', min: 16, max: 28 } }, M);
  assert.deepEqual(close.outside, ['Januar darunter (ab 15,6 °C)'], 'knapp unter der Grenze mit Nachkommastelle');
});

test('Regionsseite: häufige Fragen nur aus Daten', () => {
  const { MONTHS: M } = require('../src/lib/util');
  const climate = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, avg_high_c: [16, 16, 18, 20, 23, 29, 31, 31, 27, 25, 20, 17][i],
    rain_days: [8, 7, 10, 7, 12, 5, 4, 3, 8, 8, 8, 9][i], sea_c: [16, 15, 15, 17, 20, 24, 27, 28, 26, 24, 20, 17][i] }));
  const ranking = { entity_label_sg: 'Hotel', entity_label_pl: 'Hotels', score_name: 'TriScore', formula: { best_time: { metric: 'avg_high_c', min: 16, max: 28 } } };
  const faq = guide.regionFaq({ region: { nameIn: 'auf Mallorca' }, ranking, climate,
    bike: { score: 5, reliefM: 912, flatShare: 0.3, passes: 0, quietKm: null, routes: 0 },
    hotels: { count: 13, top: { name: 'Beispielhotel', score: 73 } }, camps: ['A', 'B'] }, M);
  const q = faq.map((f) => f.q);
  assert.deepEqual(q, ['Wann ist die beste Reisezeit auf Mallorca?', 'Wie warm ist das Meer auf Mallorca?', 'Wie oft regnet es auf Mallorca?',
    'Wie gut ist das Radrevier auf Mallorca?', 'Wie viele geprüfte Hotels gibt es auf Mallorca?', 'Gibt es organisierte Trainingscamps auf Mallorca?']);
  assert.match(faq[1].a, /^Zwischen 15 °C im Februar und 28 °C im August\. Von März bis Mai: 15 °C, 17 °C, 20 °C\./);
  assert.match(faq[2].a, /rund 89 Tage/);
  assert.match(faq[4].a, /13 geprüfte Hotels\. Den höchsten TriScore hat derzeit Beispielhotel \(73\)/);
  assert.match(faq[5].a, /2 Anbieter haben hier Camps im Programm: A, B\./);
  const bare = guide.regionFaq({ region: { nameIn: 'am Gardasee' }, ranking: { ...ranking, formula: {} }, climate: [] }, M);
  assert.deepEqual(bare, [], 'ohne Daten keine Fragen');
});

test('Regionstext: Wortzählung ohne Überschriften', () => {
  const rt = require('../src/services/region-text');
  assert.equal(rt.wordCount('## Titel mit vier Worten\n\nEins zwei drei.\n\nVier fünf.'), 5);
});

test('Regionsseite: beste Reisezeit „ganzjährig außer …“ und Frage zum Wind', () => {
  const { MONTHS: M } = require('../src/lib/util');
  const seo = require('../src/lib/seo');
  assert.equal(seo.bestTimeText([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12], M), 'ganzjährig außer August');
  assert.equal(seo.bestTimeText([3, 4, 5, 9, 10], M), 'März–Mai, September–Oktober');
  assert.equal(seo.bestTimeText(Array.from({ length: 12 }, (_, i) => i + 1), M), 'ganzjährig');
  const climate = [{ month: 1, wind_kmh: 14, windy_days: 1 }, { month: 7, wind_kmh: 23, windy_days: 4 }];
  const faq = guide.regionFaq({ region: { nameIn: 'auf Fuerteventura' }, ranking: { formula: {} }, climate }, M);
  assert.equal(faq[0].q, 'Wie windig ist es auf Fuerteventura?');
  assert.match(faq[0].a, /14 km\/h im Januar bis 23 km\/h im Juli\. Über das Jahr gibt es rund 5 Tage mit Sturmböen/);
  assert.equal(guide.bikeText({ routes: 1, reliefM: null, quietKm: null })[0], '1 ausgeschilderte Radroute.');
});

test('Regionsseite: Fragen zu Leistungen und zum Vergleich mit der Nachbarregion', () => {
  const { MONTHS: M } = require('../src/lib/util');
  const ranking = { entity_label_sg: 'Hotel', entity_label_pl: 'Hotels', score_name: 'TriScore', formula: {} };
  const faq = guide.regionFaq({ region: { nameIn: 'auf Fuerteventura' }, ranking, hotels: { count: 2, top: null },
    features: [{ q: 'Welches Hotel auf Fuerteventura hat ein 50-m-Becken?', label: '50-m-Becken im Hotel', entities: ['Playitas Hotel', 'Playitas Aparthotel'] }],
    compare: { q: 'Fuerteventura oder Lanzarote fürs Trainingslager?', a: 'Beide sind windig.' } }, M);
  assert.equal(faq[1].q, 'Welches Hotel auf Fuerteventura hat ein 50-m-Becken?');
  assert.equal(faq[1].a, '50-m-Becken im Hotel: 2 von 2 geprüften Hotels auf Fuerteventura – Playitas Hotel, Playitas Aparthotel.');
  assert.deepEqual(faq[2], { q: 'Fuerteventura oder Lanzarote fürs Trainingslager?', a: 'Beide sind windig.' });
  const none = guide.regionFaq({ region: { nameIn: 'auf Mallorca' }, ranking, hotels: { count: 13, top: null },
    features: [{ q: 'Welches Hotel auf Mallorca hat ein 50-m-Becken?', label: '50-m-Becken im Hotel', entities: [] }] }, M);
  assert.equal(none[1].a, '50-m-Becken im Hotel: bei keinem der 13 geprüften Hotels auf Mallorca bestätigt.');
});
