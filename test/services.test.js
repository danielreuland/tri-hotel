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

test('util.normalizeUrl entfernt Anzeigen- und Kampagnenparameter, behält echte', () => {
  const ad = 'https://www.zafirohotels.com/de/zafiro-tropic/?utm_source=google&utm_medium=cpc&tc_alt=1&n_okw=x&gad_source=1&gad_campaignid=2&gbraid=a&gclid=b';
  assert.equal(normalizeUrl(ad), 'https://www.zafirohotels.com/de/zafiro-tropic/');
  assert.equal(normalizeUrl('https://hotel.example/?lang=de&utm_source=x&fbclid=y#pool'), 'https://hotel.example/?lang=de#pool');
  assert.equal(normalizeUrl('https://hotel.example/zimmer?id=4'), 'https://hotel.example/zimmer?id=4');
  assert.equal(normalizeUrl('https://partner.example/h/1?aid=99&utm_source=th', { keepTracking: true }), 'https://partner.example/h/1?aid=99&utm_source=th');
});

test('extractor.scoreLink: Hotel-Unterseiten und Ausstattung vor Kette, Rechtliches nie', () => {
  const hints = extractor.hintsFrom(['Radgarage', 'Sauna / Spa']);
  const s = (path, text) => extractor.scoreLink(new URL(`https://kette.example${path}`), text, '/de/zafiro-tropic/', hints);
  assert.ok(s('/de/zafiro-tropic/fitness/', 'Fitness') > s('/de/hotels/', 'Hotels'));
  assert.ok(s('/de/zafiro-tropic/servicios/', 'Services') > s('/de/', 'Start'));
  assert.ok(s('/de/radgarage/', '') > s('/de/ueber-uns/', 'Über uns'), 'Wort aus dem Kriterienkatalog');
  assert.ok(s('/de/cookies/', 'Cookies') < -50);
  assert.ok(s('/de/magazin/', 'Magazin') < -50);
  assert.ok(s('/de/kontakt/', 'Kontakt') > s('/de/ueber-uns/', 'Über uns'), 'Kontakt für die E-Mail-Adresse');
});

test('submissions.mayMailSubmitter: nur bestätigte Melder-Adressen bekommen Mails', () => {
  const { mayMailSubmitter } = require('../src/services/submissions');
  assert.equal(mayMailSubmitter({ submitter_email: 'a@b.de', verified_at: new Date(), verified_by: null }), true);
  assert.equal(mayMailSubmitter({ submitter_email: 'a@b.de', verified_at: null, verified_by: null }), false, 'unbestätigt');
  assert.equal(mayMailSubmitter({ submitter_email: 'a@b.de', verified_at: new Date(), verified_by: 'admin' }), false, 'vom Admin statt Melder bestätigt');
  assert.equal(mayMailSubmitter({ submitter_email: null, verified_at: new Date(), verified_by: null }), false);
});

test('climate: erweiterte Monatswerte (Wind, windige Tage, Sonne) nur auf Wunsch', () => {
  const daily = {
    time: ['2024-03-01', '2024-03-02', '2025-03-01'],
    temperature_2m_max: [20, 22, 21], temperature_2m_min: [12, 13, 12], precipitation_sum: [0, 2, 0],
    wind_speed_10m_mean: [20, 30, 25], wind_speed_10m_max: [35, 45, 50], sunshine_duration: [36000, 28800, 32400],
  };
  const mar = climate.aggregateMonthly(daily)[2];
  assert.equal(mar.wind_kmh, 25);
  assert.equal(mar.windy_days, 1, '2 windige Tage in 2 Jahren');
  assert.equal(mar.sunshine_h, 9);
  const basic = climate.aggregateMonthly({ time: daily.time, temperature_2m_max: daily.temperature_2m_max, temperature_2m_min: daily.temperature_2m_min, precipitation_sum: daily.precipitation_sum })[2];
  assert.equal(basic.wind_kmh, undefined, 'Hotels: unverändert ohne Wind');
});

test('climate: Wassertemperatur am nächsten Meerespunkt innerhalb der Region, sonst Binnenland', () => {
  const center = { lat: 39.6, lng: 2.95 };
  const cands = climate.seaCandidates(center, 60);
  assert.equal(cands.length, 25);
  assert.equal(climate.seaCandidates(center, 10, [0.2, 0.5, 1]).length, 25);
  const land = { latitude: 39.6, longitude: 2.95, daily: { sea_surface_temperature_mean: [null, null] } };
  const near = { latitude: 39.45, longitude: 2.95, daily: { sea_surface_temperature_mean: [25.1, null] } };
  const far = { latitude: 38.9, longitude: 2.95, daily: { sea_surface_temperature_mean: [26] } };
  const results = cands.map((c, i) => (i === 3 ? far : i === 1 ? near : land));
  const p = climate.pickSeaPoint(center, 60, cands, results);
  assert.equal(p.lat, 39.45, 'nächster Treffer gewinnt');
  assert.ok(p.distance_km < 20);
  assert.equal(climate.pickSeaPoint(center, 60, cands, cands.map(() => land)), null, 'kein Meer → null');
  assert.equal(climate.pickSeaPoint(center, 10, [center], [far]), null, 'Meer außerhalb des Radius zählt nicht');
});

test('climate: Region – je Richtung die küstennächste Meereszelle, doppelte Zellen einmal', () => {
  const center = { lat: 39.6, lng: 2.95 };
  const cands = climate.seaCandidates(center, 60);
  const land = { daily: { sea_surface_temperature_mean: [null] } };
  const cell = (lat, lng) => ({ latitude: lat, longitude: lng, daily: { sea_surface_temperature_mean: [24] } });
  // Richtung 0 (Norden): Ring 2 und 3 mit Wasser -> Ring 2 zählt; Richtung 4 (Süden): nur Ring 3; Richtung 1 liefert dieselbe Zelle wie Richtung 0
  const results = cands.map((c) => {
    if (c.dir === 0 && c.ring >= 2) return cell(c.ring === 2 ? 39.95 : 40.1, 2.95);
    if (c.dir === 1 && c.ring === 3) return cell(39.95, 2.95);
    if (c.dir === 4 && c.ring === 3) return cell(39.1, 2.95);
    return land;
  });
  const pts = climate.pickCoastPoints(center, 60, cands, results);
  assert.equal(pts.length, 2, 'Norden (Ring 2) und Süden, doppelte Zelle nur einmal');
  assert.deepEqual(pts.map((p) => p.lat).sort(), [39.1, 39.95]);
});

test('climate: Hotel – nur an der Küste (Höhe 0 in ≤ 3 km); nächste Meereszelle zählt bis 20 km (Raster etwa 8–9 km)', async () => {
  const orig = global.fetch;
  const reply = (cell, coast = true) => async (url) => {
    if (url.includes('/elevation')) return { ok: true, json: async () => ({ elevation: coast ? [12, 0, 5] : [12, 4, 25] }) };
    const daily = url.includes('2023-01-01') || /start_date=\d{4}-01-01/.test(url)
      ? { time: ['2025-01-15', '2025-08-15'], sea_surface_temperature_mean: [15, 26] }
      : { time: ['x'], sea_surface_temperature_mean: cell ? [27] : [null] };
    return { ok: true, json: async () => ({ latitude: cell ? cell.lat : 0, longitude: cell ? cell.lng : 0, daily }) };
  };
  try {
    const hotel = { lat: 39.844616, lng: 3.134473 };
    global.fetch = reply({ lat: 39.958336, lng: 3.1250153 });
    const sea = await climate.hotelSea(hotel);
    assert.ok(sea, 'Zelle in 12,7 km zählt');
    assert.equal(sea.points[0].distance_km, 12.7);
    assert.equal(sea.months[7], 26);
    global.fetch = reply({ lat: 40.2, lng: 3.13 });
    assert.equal(await climate.hotelSea(hotel), null, 'Zelle in ~40 km zählt nicht');
    global.fetch = reply(null);
    assert.equal(await climate.hotelSea(hotel), null, 'Binnenland');
    global.fetch = reply({ lat: 39.958336, lng: 3.1250153 }, false);
    assert.equal(await climate.hotelSea(hotel), null, 'kein Punkt auf Meereshöhe in 3 km (z. B. Hotel an einem See)');
  } finally {
    global.fetch = orig;
  }
});
