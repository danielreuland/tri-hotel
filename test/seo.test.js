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
  const formula = { best_time: { metric: 'avg_high_c', min: 16, max: 28 } };
  const climate = seo.averageClimate([
    { month: 3, avg_high_c: 17, rain_days: 4 }, { month: 3, avg_high_c: 19, rain_days: 5 }, // Ø 18 °C, 4,5 Tage
    { month: 4, avg_high_c: 21, rain_days: 3 },
    { month: 7, avg_high_c: 32, rain_days: 0 },
    { month: 10, avg_high_c: 24, rain_days: 4 },
  ]);
  assert.deepEqual(climate.find((c) => c.month === 3), { month: 3, avg_high_c: 18, avg_low_c: null, rain_days: 4.5 });
  const best = seo.bestMonths(formula, climate);
  assert.deepEqual(best, [3, 4, 10]);
  assert.equal(seo.monthRanges(best, MONTHS), 'März–April, Oktober');
  assert.deepEqual(seo.bestMonths({}, climate), [], 'ohne Regel keine Aussage');
});

test('monthRanges: Spanne über den Jahreswechsel und ganzjährig', () => {
  assert.equal(seo.monthRanges([1, 2, 3, 4, 5, 6, 10, 11, 12], MONTHS), 'Oktober–Juni');
  assert.equal(seo.monthRanges([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], MONTHS), 'ganzjährig');
  assert.equal(seo.monthRanges([5, 6, 7, 8, 9], MONTHS), 'Mai–September');
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

test('seo.googleMapsUrl: Suche nach Name und Anschrift, mit Place ID exakt', () => {
  const seo = require('../src/lib/seo');
  const e = { name: 'Hotel Jakob', city: 'Fuschl am See', country: 'AT', attributes: { address: { street: 'Dorfplatz 3', postal_code: '5330' } } };
  const u = new URL(seo.googleMapsUrl(e));
  assert.equal(u.origin + u.pathname, 'https://www.google.com/maps/search/');
  assert.equal(u.searchParams.get('query'), 'Hotel Jakob, Dorfplatz 3, 5330, Fuschl am See, Österreich');
  assert.equal(u.searchParams.get('query_place_id'), null);
  assert.equal(new URL(seo.googleMapsUrl({ ...e, attributes: { google_place_id: 'ChIJabc123def' } })).searchParams.get('query_place_id'), 'ChIJabc123def');
});

test('seo.googleMapsEmbedUrl: nur mit Schlüssel, Place ID bevorzugt', () => {
  const seo = require('../src/lib/seo');
  const e = { name: 'Hotel Jakob', city: 'Fuschl am See', country: 'AT', attributes: {} };
  assert.equal(seo.googleMapsEmbedUrl(e, null), null);
  const u = new URL(seo.googleMapsEmbedUrl(e, 'KEY'));
  assert.equal(u.origin + u.pathname, 'https://www.google.com/maps/embed/v1/place');
  assert.equal(u.searchParams.get('q'), 'Hotel Jakob, Fuschl am See, Österreich');
  assert.equal(new URL(seo.googleMapsEmbedUrl({ ...e, attributes: { google_place_id: 'ChIJxyz123abc' } }, 'KEY')).searchParams.get('q'), 'place_id:ChIJxyz123abc');
});

test('seo.fitTitle / fitDescription: Längen für Suchergebnisse', () => {
  const seo = require('../src/lib/seo');
  assert.equal(seo.fitTitle('Kontakt', 'tri-hotel.de'), 'Kontakt · tri-hotel.de');
  const long = 'Triathlon-Trainingscamp: Ratgeber und Anbieter im Vergleich';
  assert.equal(seo.fitTitle(long, 'tri-hotel.de'), long, 'Marke entfällt, wenn sie nicht mehr passt');
  const d = seo.fitDescription('Wort '.repeat(50));
  assert.ok(d.length <= seo.DESC_MAX && d.endsWith('…'));
  assert.equal(seo.fitDescription('Kurz.'), 'Kurz.');
});

test('Titel der Profilseite: lange Namen ohne Ort, notfalls gekürzt, Score bleibt', () => {
  assert.equal(seo.entityTitle('Aktivhotel Santa Lucia', 'Torbole', 'TriScore 78'), 'Aktivhotel Santa Lucia (Torbole) – TriScore 78');
  const noPlace = seo.entityTitle('Hotel Blau Colonia Sant Jordi Resort & Spa', 'Mallorca', 'TriScore 81');
  assert.equal(noPlace, 'Hotel Blau Colonia Sant Jordi Resort & Spa – TriScore 81');
  const cut = seo.entityTitle('Jugend- und Sporthotel Euroville mit Sportschule und Seminarzentrum', 'Naumburg (Saale)', 'TriScore 70');
  assert.ok(cut.length <= seo.TITLE_MAX, cut);
  assert.match(cut, /… – TriScore 70$/);
});

test('Hotel-Daten: Sterne der Athleten nur mit veröffentlichten Bewertungen', () => {
  const base = { entity: { name: 'X', city: 'Y', country: 'ES' }, ranking: { entity_type: 'hotel', score_name: 'TriScore' }, site: { name: 'tri-hotel.de' }, url: 'https://tri-hotel.de/hotel/x' };
  assert.equal(seo.entityLd(base).aggregateRating, undefined);
  assert.deepEqual(seo.entityLd({ ...base, reviewCount: 3, reviewAvg: '4.333' }).aggregateRating, { '@type': 'AggregateRating', ratingValue: 4.3, ratingCount: 3, bestRating: 5, worstRating: 1 });
});

test('Sitemap-Datum: jüngster gültiger Wert', () => {
  assert.equal(seo.latest(['2026-10-01', new Date('2026-10-20T08:00:00Z'), null, 'kaputt']).toISOString().slice(0, 10), '2026-10-20');
  assert.equal(seo.latest([]), null);
  assert.equal(seo.latest([null, undefined]), null);
});

test('Schrägstrich am Ende wird weitergeleitet, Startseite und Fremd-Hosts nicht', () => {
  assert.equal(seo.withoutTrailingSlash('/hotels/'), '/hotels');
  assert.equal(seo.withoutTrailingSlash('/hotels/?land=ES'), '/hotels?land=ES');
  assert.equal(seo.withoutTrailingSlash('/region/fuerteventura//'), '/region/fuerteventura');
  assert.equal(seo.withoutTrailingSlash('/hotels'), null);
  assert.equal(seo.withoutTrailingSlash('/'), null);
  assert.equal(seo.withoutTrailingSlash('/?q=a/'), null);
  // kein offener Redirect auf //andere-seite.de
  assert.equal(seo.withoutTrailingSlash('//evil.example/'), null);
});
