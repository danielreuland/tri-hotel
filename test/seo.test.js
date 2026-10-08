const test = require('node:test');
const assert = require('node:assert/strict');
const seo = require('../src/lib/seo');
const og = require('../src/services/og');

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

test('Länder: Name, Präposition und Slug', () => {
  assert.equal(seo.countryName('ES'), 'Spanien');
  assert.equal(seo.countryIn('ES'), 'in Spanien');
  assert.equal(seo.countryIn('TR'), 'in der Türkei');
  assert.equal(seo.countrySlug('TR'), 'tuerkei');
  assert.equal(seo.countryFromSlug('tuerkei'), 'TR');
  assert.equal(seo.countryFromSlug('atlantis'), null);
});

test('Regionen: Zuordnung über Mittelpunkt und Radius', () => {
  const mallorca = { lat: 39.62, lng: 2.98, radius_km: 60 };
  assert.ok(seo.inRegion({ lat: '39.8430', lng: '3.1261' }, mallorca), 'Port d’Alcúdia');
  assert.ok(!seo.inRegion({ lat: 28.229, lng: -13.988 }, mallorca), 'Fuerteventura');
  assert.ok(!seo.inRegion({ lat: null, lng: null }, mallorca), 'ohne Koordinaten');
});

test('Beste Reisemonate folgen den Klima-Kriterien des Rankings', () => {
  const criteria = [
    { code: 'temp', max_points: 4, scoring: { type: 'climate', metric: 'avg_high_c', bands: [{ min: 15, max: 30, points: 4 }] } },
    { code: 'rain', max_points: 1, scoring: { type: 'climate', metric: 'rain_days', bands: [{ min: 0, max: 4.9, points: 1 }] } },
  ];
  const climate = seo.averageClimate([
    { month: 3, avg_high_c: 17, rain_days: 4 }, { month: 3, avg_high_c: 19, rain_days: 5 }, // Ø 18 °C, 4,5 Tage
    { month: 4, avg_high_c: 21, rain_days: 3 },
    { month: 7, avg_high_c: 32, rain_days: 0 },
    { month: 10, avg_high_c: 24, rain_days: 4 },
  ]);
  assert.deepEqual(climate.find((c) => c.month === 3), { month: 3, avg_high_c: 18, avg_low_c: null, rain_days: 4.5 });
  const best = seo.bestMonths(criteria, climate);
  assert.deepEqual(best, [3, 4, 10]);
  assert.equal(seo.monthRanges(best, MONTHS), 'März–April, Oktober');
  assert.deepEqual(seo.bestMonths([], climate), [], 'ohne Klima-Kriterien keine Aussage');
});

test('Ausstattung je Bereich: häufigste filterbare Leistungen', () => {
  const map = new Map([
    ['a', [{ code: 'sauna', label: 'Sauna', filterable: true }, { code: 'gpx', label: 'GPX', filterable: false }]],
    ['b', [{ code: 'sauna', label: 'Sauna', filterable: true }, { code: 'pool_50', label: '50-m-Becken', filterable: true }]],
  ]);
  assert.deepEqual(seo.featureShares([{ id: 'a' }, { id: 'b' }], map), [{ label: 'Sauna', n: 2 }, { label: '50-m-Becken', n: 1 }]);
});

test('JSON-LD: sicher eingebettet, Bewertung nur mit aussagekräftigem Score', () => {
  assert.equal(seo.ldJson({ x: '</script><b>' }), '{"x":"\\u003c/script\\u003e\\u003cb\\u003e"}');
  const base = { entity: { name: 'Hotel X', city: 'Palma', country: 'ES', lat: '39.5', lng: '2.6' }, ranking: { entity_type: 'hotel', score_name: 'TriScore' }, site: { name: 'tri-hotel.de' }, url: 'https://tri-hotel.de/hotel/x' };
  const withScore = seo.entityLd({ ...base, result: { eligible: true, score: 88, label: 'Top' } });
  assert.equal(withScore['@type'], 'Hotel');
  assert.equal(withScore.review.reviewRating.ratingValue, 88);
  assert.equal(withScore.review.author.name, 'tri-hotel.de');
  assert.equal(seo.entityLd({ ...base, result: { eligible: false, score: 100 } }).review, undefined, 'unvollständig: keine Bewertung');
  const crumbs = seo.breadcrumbLd([{ name: 'A', url: 'u1' }, { name: 'B', url: 'u2' }]);
  assert.equal(crumbs.itemListElement[1].position, 2);
});

test('Vorschaubild: Titel wird umbrochen und gekürzt, Text maskiert', () => {
  assert.deepEqual(og.wrap('Das richtige Hotel fürs Trainingslager auf Mallorca', 20, 2), ['Das richtige Hotel', 'fürs Trainingslager…']);
  const svg = og.svg({ eyebrow: 'TriScore', title: 'A & B <Hotel>', subtitle: 'Palma', score: 91, label: 'Top', site: { logo_text: 'TRI-HOTEL', theme: { preset: 'pool' } } });
  assert.ok(svg.includes('A &amp; B &lt;Hotel&gt;'));
  assert.ok(svg.includes('>91<'));
  assert.ok(svg.includes('#12345a'), 'Farben der Palette');
});
