// Messstationen (NOAA, gemeinfrei): Wind aus den stündlichen Meldungen (ISD „global-hourly“), Regentage aus den
// Tageswerten (GHCN-Daily, Niederschlag ≥ 1 mm). Grund: Die Modellwerte von Open-Meteo unterschätzen den Wind an Küsten
// und in Tälern deutlich (Teneriffa Süd 11 statt 20 km/h) und zählen im Mittel 18 Regentage im Jahr zu viel – Vergleich mit
// 11 Stationen 2023–2024 am 03.11.2026. Die Temperatur bleibt beim Modell (dort im Mittel nur 0,8 °C zu kühl).
// Je Region: Windstation und Regenstation nahe dem Klimapunkt. Je Hotel: Regenstation ≤ HOTEL_RAIN_KM mit ähnlicher Höhe.
// Ohne passende Station bleiben die Modellwerte (Spalten *_model) stehen. Monatswerte je Station werden zwischengespeichert.
const db = require('../db');
const config = require('../config');
const geo = require('./geo');
const { WINDY_KMH } = require('./climate');

const SEARCH = 'https://www.ncei.noaa.gov/access/services/search/v1/data';
const DATA = 'https://www.ncei.noaa.gov/access/services/data/v1';
const MAX_AGE_DAYS = 180;      // Stationswerte so lange wiederverwenden
const MIN_DAYS = 40;           // Tage mit Messwerten je Kalendermonat (über alle Jahre), sonst kein Monatswert
const MIN_MONTHS = 10;         // so viele gültige Monate braucht eine Station, sonst nächster Kandidat
const MIN_OBS_PER_DAY = 8;     // Windmeldungen je Tag für ein Tagesmittel
const HOTEL_RAIN_KM = 25;
const REGION_MAX_KM = 60;      // Station höchstens so weit vom Klimapunkt (bzw. Regionsradius, wenn kleiner) – GHCN ist in Südeuropa dünn
const MAX_ELEV_DIFF_M = 300;
const CANDIDATES = 3;

const KINDS = {
  wind: { source: 'isd', dataset: 'global-hourly', dataType: 'WND' },
  rain: { source: 'ghcn', dataset: 'daily-summaries', dataType: 'PRCP' },
};

const round1 = (x) => Math.round(x * 10) / 10;
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const DAYS_IN_MONTH = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Gleicher Zeitraum wie das Modellklima: die letzten drei vollen Jahre
function period(now = new Date()) {
  const last = now.getFullYear() - 1;
  return { start: `${last - 2}-01-01`, end: `${last}-12-31`, label: `${last - 2}–${last}` };
}

// ISD-Windfeld „Richtung,Q,Typ,Geschwindigkeit (m/s × 10),Q“ -> km/h oder null. Nur METAR/SYNOP (keine Sondermeldungen).
function isdWindKmh(row) {
  if (!/^FM-1[25]$/.test(String(row.REPORT_TYPE || '').trim())) return null;
  const p = String(row.WND || '').split(',');
  if (p.length < 5 || p[3] === '9999' || !/^[01459]$/.test(p[4])) return null;
  return (Number(p[3]) / 10) * 3.6;
}

// Stündliche Meldungen -> Monatswerte: Ø Wind (Mittel der Tagesmittel) und Starkwindtage (Stundenmittel ≥ WINDY_KMH)
function aggregateWind(rows) {
  const days = new Map();
  for (const r of rows) {
    const v = isdWindKmh(r);
    if (v === null) continue;
    const d = String(r.DATE).slice(0, 10);
    if (!days.has(d)) days.set(d, []);
    days.get(d).push(v);
  }
  const months = Array.from({ length: 12 }, () => ({ means: [], windy: 0 }));
  for (const [d, list] of days) {
    if (list.length < MIN_OBS_PER_DAY) continue;
    const m = months[Number(d.slice(5, 7)) - 1];
    m.means.push(mean(list));
    if (Math.max(...list) >= WINDY_KMH) m.windy += 1;
  }
  return months.map((m, i) => (m.means.length >= MIN_DAYS
    ? { month: i + 1, wind_kmh: round1(mean(m.means)), windy_days: round1((m.windy / m.means.length) * DAYS_IN_MONTH[i]), days: m.means.length }
    : { month: i + 1, wind_kmh: null, windy_days: null, days: m.means.length }));
}

// GHCN-Tageswerte -> Regentage je Monat (Anteil der Tage mit ≥ 1 mm × Tage des Monats)
function aggregateRain(rows) {
  const months = Array.from({ length: 12 }, () => ({ n: 0, wet: 0 }));
  for (const r of rows) {
    if (r.PRCP === undefined || r.PRCP === null || r.PRCP === '') continue;
    const m = months[Number(String(r.DATE).slice(5, 7)) - 1];
    m.n += 1;
    if (Number(r.PRCP) >= 1) m.wet += 1;
  }
  return months.map((m, i) => (m.n >= MIN_DAYS
    ? { month: i + 1, rain_days: round1((m.wet / m.n) * DAYS_IN_MONTH[i]), days: m.n }
    : { month: i + 1, rain_days: null, days: m.n }));
}

const validMonths = (months, key) => months.filter((m) => m[key] !== null && m[key] !== undefined).length;

async function getJson(url) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': config.userAgent }, signal: AbortSignal.timeout(120000) });
    if (res.ok) return res.json();
    if (res.status >= 500 && attempt < 2) { await new Promise((ok) => setTimeout(ok, 10000 * (attempt + 1))); continue; }
    throw new Error(`NOAA ${res.status}`);
  }
}

// Stationen im Umkreis mit dem gesuchten Messwert im Zeitraum, nächste zuerst
async function search(kind, point, radiusKm, per = period()) {
  const k = KINDS[kind];
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos((point.lat * Math.PI) / 180));
  const bbox = [point.lat + dLat, point.lng - dLng, point.lat - dLat, point.lng + dLng].map((x) => x.toFixed(4)).join(',');
  const params = new URLSearchParams({ dataset: k.dataset, bbox, startDate: `${per.start}T00:00:00`, endDate: `${per.end}T23:59:59`, dataTypes: k.dataType, limit: '50' });
  const json = await getJson(`${SEARCH}?${params}`);
  const byId = new Map();
  for (const r of json.results || []) {
    const c = r.boundingPoints && r.boundingPoints[0] && r.boundingPoints[0].coordinates;
    for (const s of r.stations || []) {
      const has = (s.dataTypes || []).some((t) => t.id === k.dataType && (t.coverage === undefined || t.coverage > 0));
      if (!has || !c || byId.has(s.id)) continue;
      const st = { id: `${k.source}:${s.id}`, code: s.id, source: k.source, name: s.name, lat: c[1], lng: c[0] };
      st.distance_km = round1(geo.distanceKm(point, st));
      if (st.distance_km <= radiusKm) byId.set(s.id, st);
    }
  }
  return [...byId.values()].sort((a, b) => a.distance_km - b.distance_km);
}

// Monatswerte einer Station (aus dem Zwischenspeicher oder neu von NOAA)
async function stationMonths(st, per = period()) {
  const cached = await db.one(
    `SELECT * FROM weather_stations WHERE id = $1 AND period = $2 AND fetched_at > now() - make_interval(days => $3)`, [st.id, per.label, MAX_AGE_DAYS]);
  if (cached) return { station: cached, months: await db.many('SELECT * FROM weather_station_monthly WHERE station_id = $1 ORDER BY month', [st.id]) };
  const k = KINDS[st.source === 'isd' ? 'wind' : 'rain'];
  const params = new URLSearchParams({ dataset: k.dataset, stations: st.code, startDate: per.start, endDate: per.end, dataTypes: k.dataType, format: 'json', ...(st.source === 'ghcn' ? { units: 'metric' } : {}) });
  const rows = await getJson(`${DATA}?${params}`);
  const months = st.source === 'isd' ? aggregateWind(rows || []) : aggregateRain(rows || []);
  await db.tx(async (c) => {
    await c.query(
      `INSERT INTO weather_stations (id, source, code, name, lat, lng, elevation_m, period, fetched_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
         elevation_m = COALESCE(EXCLUDED.elevation_m, weather_stations.elevation_m), period = EXCLUDED.period, fetched_at = now()`,
      [st.id, st.source, st.code, st.name, st.lat, st.lng, st.elevation_m ?? null, per.label]);
    await c.query('DELETE FROM weather_station_monthly WHERE station_id = $1', [st.id]);
    for (const m of months) {
      await c.query(`INSERT INTO weather_station_monthly (station_id, month, wind_kmh, windy_days, rain_days, days) VALUES ($1,$2,$3,$4,$5,$6)`,
        [st.id, m.month, m.wind_kmh ?? null, m.windy_days ?? null, m.rain_days ?? null, m.days]);
    }
  });
  return { station: { ...st, period: per.label }, months };
}

// Nächste brauchbare Station: im Umkreis, bei Bedarf mit ähnlicher Höhe, mit genug Messwerten
async function bestStation(kind, point, { radiusKm, elevation = null, maxElevDiff = null } = {}) {
  let list = await search(kind, point, radiusKm);
  if (!list.length) return null;
  if (maxElevDiff !== null && elevation !== null) {
    const elev = await geo.elevations(list.slice(0, 10));
    list = list.slice(0, 10).map((s, i) => ({ ...s, elevation_m: elev[i] ?? null }))
      .filter((s) => s.elevation_m === null || Math.abs(s.elevation_m - elevation) <= maxElevDiff);
  }
  const key = kind === 'wind' ? 'wind_kmh' : 'rain_days';
  for (const st of list.slice(0, CANDIDATES)) {
    const res = await stationMonths(st);
    if (validMonths(res.months, key) >= MIN_MONTHS) {
      return { ref: { id: st.id, name: titleCase(st.name), distance_km: st.distance_km, period: res.station.period }, months: res.months };
    }
  }
  return null;
}

// „LANZAROTE, SP“ -> „Lanzarote“
function titleCase(name) {
  return String(name || '').replace(/,\s*[A-Z]{2}$/, '').toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).trim();
}

// Stationswerte in die Klimatabellen übernehmen (fehlende Monate: Modellwert)
async function applyRegion(regionId) {
  const r = await db.one('SELECT wind_station, rain_station FROM regions WHERE id = $1', [regionId]);
  if (!r) return;
  const wind = r.wind_station ? await db.many('SELECT * FROM weather_station_monthly WHERE station_id = $1', [r.wind_station.id]) : [];
  const rain = r.rain_station ? await db.many('SELECT * FROM weather_station_monthly WHERE station_id = $1', [r.rain_station.id]) : [];
  for (let m = 1; m <= 12; m++) {
    const w = wind.find((x) => x.month === m) || {};
    const p = rain.find((x) => x.month === m) || {};
    await db.query(
      `UPDATE region_climate_monthly SET wind_kmh = COALESCE($3, wind_kmh_model), windy_days = COALESCE($4, windy_days_model),
         rain_days = COALESCE($5, rain_days_model) WHERE region_id = $1 AND month = $2`,
      [regionId, m, w.wind_kmh ?? null, w.windy_days ?? null, p.rain_days ?? null]);
  }
}

async function applyEntity(entityId) {
  const e = await db.one(`SELECT attributes->'rain_station' AS st FROM entities WHERE id = $1`, [entityId]);
  const rain = e && e.st ? await db.many('SELECT * FROM weather_station_monthly WHERE station_id = $1', [e.st.id]) : [];
  for (let m = 1; m <= 12; m++) {
    const p = rain.find((x) => x.month === m) || {};
    await db.query('UPDATE climate_monthly SET rain_days = COALESCE($3, rain_days_model) WHERE entity_id = $1 AND month = $2', [entityId, m, p.rain_days ?? null]);
  }
}

// Region: Stationen neu bestimmen (Netz), speichern, übernehmen. Rückgabe: kurzer Text für Admin/Protokoll
async function updateRegion(region) {
  const cp = region.climate_point || {};
  const point = cp.lat ? { lat: Number(cp.lat), lng: Number(cp.lng) } : { lat: Number(region.lat), lng: Number(region.lng) };
  const radiusKm = Math.min(REGION_MAX_KM, Math.max(15, Number(region.radius_km) || REGION_MAX_KM));
  const elevation = cp.elevation_m ?? null;
  const wind = await bestStation('wind', point, { radiusKm, elevation, maxElevDiff: elevation !== null ? MAX_ELEV_DIFF_M : null });
  const rain = await bestStation('rain', point, { radiusKm, elevation, maxElevDiff: elevation !== null ? MAX_ELEV_DIFF_M : null });
  await db.query('UPDATE regions SET wind_station = $2, rain_station = $3 WHERE id = $1',
    [region.id, wind ? JSON.stringify(wind.ref) : null, rain ? JSON.stringify(rain.ref) : null]);
  await applyRegion(region.id);
  return `Wind ${wind ? `${wind.ref.name} (${wind.ref.distance_km} km)` : 'Modell (keine Station)'}, Regen ${rain ? `${rain.ref.name} (${rain.ref.distance_km} km)` : 'Modell (keine Station)'}`;
}

// Hotel: Regenstation ≤ HOTEL_RAIN_KM mit ähnlicher Höhe
async function updateEntity(entity) {
  const point = { lat: Number(entity.lat), lng: Number(entity.lng) };
  const [elevation] = await geo.elevations([point]);
  const rain = await bestStation('rain', point, { radiusKm: HOTEL_RAIN_KM, elevation: elevation ?? null, maxElevDiff: MAX_ELEV_DIFF_M });
  await db.query(
    `UPDATE entities SET attributes = (CASE WHEN $2::jsonb IS NULL THEN attributes - 'rain_station' ELSE attributes || jsonb_build_object('rain_station', $2::jsonb) END)
       || jsonb_build_object('stations_checked_at', now()::date) WHERE id = $1`,
    [entity.id, rain ? JSON.stringify(rain.ref) : null]);
  await applyEntity(entity.id);
  return rain ? `Regentage von Messstation ${rain.ref.name} (${rain.ref.distance_km} km)` : 'Regentage aus dem Modell (keine Station in der Nähe)';
}

// Wind der Region eines Objekts (für Hotelseite und Beschreibungstext); null ohne Station
async function regionWind(region) {
  if (!region || !region.wind_station) return null;
  const months = await db.many('SELECT month, wind_kmh, windy_days FROM weather_station_monthly WHERE station_id = $1 ORDER BY month', [region.wind_station.id]);
  return months.some((m) => m.wind_kmh !== null) ? { station: region.wind_station, region: region.name, months } : null;
}

// Quellenhinweis für Seiten: „Messstation X (12 km, 2023–2025)“
function stationText(ref) {
  return ref ? `Messstation ${ref.name} (${String(ref.distance_km).replace('.', ',')} km, ${ref.period})` : null;
}

module.exports = {
  period, isdWindKmh, aggregateWind, aggregateRain, titleCase, search, stationMonths, bestStation,
  applyRegion, applyEntity, updateRegion, updateEntity, regionWind, stationText, HOTEL_RAIN_KM, MAX_ELEV_DIFF_M,
};
