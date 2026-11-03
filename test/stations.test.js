const test = require('node:test');
const assert = require('node:assert/strict');
const stations = require('../src/services/stations');
const regionGuide = require('../src/services/region-guide');

test('stations.isdWindKmh: METAR/SYNOP mit gültiger Qualität, Sondermeldungen und Fehlwerte nicht', () => {
  assert.equal(stations.isdWindKmh({ REPORT_TYPE: 'FM-15', WND: '040,1,N,0050,1' }), 18);
  assert.equal(stations.isdWindKmh({ REPORT_TYPE: 'FM-12', WND: '999,9,C,0000,1' }), 0, 'Windstille zählt');
  assert.equal(stations.isdWindKmh({ REPORT_TYPE: 'FM-16', WND: '040,1,N,0050,1' }), null, 'SPECI nicht');
  assert.equal(stations.isdWindKmh({ REPORT_TYPE: 'FM-15', WND: '040,1,N,9999,9' }), null);
  assert.equal(stations.isdWindKmh({ REPORT_TYPE: 'FM-15', WND: '040,1,N,0050,3' }), null, 'fragliche Qualität nicht');
});

// n Tage im Monat (Jahr 2024), je Tag 24 Meldungen mit speed m/s
function hourly(month, days, speed, windyDays = 0) {
  const rows = [];
  for (let d = 1; d <= days; d++) {
    for (let h = 0; h < 24; h++) {
      const v = d <= windyDays && h === 12 ? 12 : speed; // 12 m/s = 43,2 km/h
      rows.push({ REPORT_TYPE: 'FM-15', DATE: `2024-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00`, WND: `090,1,N,${String(v * 10).padStart(4, '0')},1` });
    }
  }
  return rows;
}

test('stations.aggregateWind: Mittel der Tagesmittel, Starkwindtage auf den Monat hochgerechnet, zu wenige Tage -> null', () => {
  const rows = [...hourly(7, 31, 5, 0), ...hourly(7, 31, 5, 0).map((r) => ({ ...r, DATE: r.DATE.replace('2024', '2023') })), ...hourly(1, 20, 5)];
  const m = stations.aggregateWind(rows);
  assert.equal(m[6].wind_kmh, 18);
  assert.equal(m[6].windy_days, 0);
  assert.equal(m[6].days, 62);
  assert.equal(m[0].wind_kmh, null, 'nur 20 Tage im Januar');
  const windy = stations.aggregateWind([...hourly(8, 31, 5, 10), ...hourly(8, 31, 5, 10).map((r) => ({ ...r, DATE: r.DATE.replace('2024', '2023') }))]);
  assert.equal(windy[7].windy_days, 10, '10 von 31 Tagen mit Stundenmittel ≥ 40 km/h');
  const sparse = stations.aggregateWind(hourly(3, 31, 5).filter((r, i) => i % 6 === 0).concat(hourly(3, 31, 5).filter((r, i) => i % 6 === 0).map((r) => ({ ...r, DATE: r.DATE.replace('2024', '2023') }))));
  assert.equal(sparse[2].wind_kmh, null, 'nur 4 Meldungen je Tag -> kein Tagesmittel');
});

test('stations.aggregateRain: Anteil der Tage mit ≥ 1 mm × Tage des Monats; fehlende Werte zählen nicht', () => {
  const rows = [];
  for (const y of [2023, 2024]) for (let d = 1; d <= 30; d++) rows.push({ DATE: `${y}-11-${String(d).padStart(2, '0')}`, PRCP: d <= 6 ? '2.5' : d === 7 ? '0.8' : '0' });
  rows.push({ DATE: '2024-11-30', PRCP: '' });
  const m = stations.aggregateRain(rows);
  assert.equal(m[10].rain_days, 6, '0,8 mm zählt nicht');
  assert.equal(m[10].days, 60);
  assert.equal(m[0].rain_days, null);
});

test('stations: Zeitraum wie beim Modellklima, Stationsname lesbar, Quellenhinweis', () => {
  assert.deepEqual(stations.period(new Date('2026-11-03')), { start: '2023-01-01', end: '2025-12-31', label: '2023–2025' });
  assert.equal(stations.titleCase('LAS PALMAS DE GRAN CANARIA GAN, SP'), 'Las Palmas De Gran Canaria Gan');
  assert.equal(stations.titleCase('TENERIFE SUR, SP'), 'Tenerife Sur');
  assert.equal(stations.stationText({ name: 'Tenerife Sur', distance_km: 12.5, period: '2023–2025' }), 'Messstation Tenerife Sur (12,5 km, 2023–2025)');
  assert.equal(stations.stationText(null), null);
});

test('region-guide.climatePointNote: nennt die Messstationen für Wind und Regen', () => {
  const st = { name: 'Lanzarote', distance_km: 3.2, period: '2023–2025' };
  const both = regionGuide.climatePointNote({ climate_point: { source: 'hotels', place: 'Costa Teguise', elevation_m: 20 }, wind_station: st, rain_station: st });
  assert.match(both, /Wind und Regentage gemessen an der Wetterstation Lanzarote \(3,2 km, 2023–2025\)/);
  const none = regionGuide.climatePointNote({ climate_point: { source: 'hotels' } });
  assert.ok(!/Wetterstation/.test(none));
});
