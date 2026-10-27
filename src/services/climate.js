// Klima je Monat aus Open-Meteo (Archiv der letzten drei vollen Jahre).
// avg_high_c / avg_low_c = Mittel der Tageshöchst-/-tiefstwerte, rain_days = Tage mit ≥ 1 mm Niederschlag.
// Erweitert (Regionen): wind_kmh = mittlere Windgeschwindigkeit, windy_days = Tage mit Spitzenwind ≥ 40 km/h,
// sunshine_h = Sonnenstunden je Tag; Wassertemperatur separat über die Marine-API (seaTemperature).
const config = require('../config');
const { distanceKm } = require('./geo');

const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
const MARINE = 'https://marine-api.open-meteo.com/v1/marine';
const WINDY_KMH = 40;

const round1 = (x) => Math.round(x * 10) / 10;
const avg = (a) => (a.length ? round1(a.reduce((s, x) => s + x, 0) / a.length) : null);

function aggregateMonthly(daily) {
  const extended = Array.isArray(daily.wind_speed_10m_mean);
  const buckets = Array.from({ length: 12 }, () => ({ high: [], low: [], rain: 0, wind: [], windy: 0, sun: [], years: new Set() }));
  daily.time.forEach((day, i) => {
    const month = Number(day.slice(5, 7)) - 1;
    const b = buckets[month];
    if (daily.temperature_2m_max[i] !== null) b.high.push(daily.temperature_2m_max[i]);
    if (daily.temperature_2m_min[i] !== null) b.low.push(daily.temperature_2m_min[i]);
    if ((daily.precipitation_sum[i] ?? 0) >= 1) b.rain += 1;
    if (extended) {
      if (daily.wind_speed_10m_mean[i] !== null) b.wind.push(daily.wind_speed_10m_mean[i]);
      if ((daily.wind_speed_10m_max[i] ?? 0) >= WINDY_KMH) b.windy += 1;
      if (daily.sunshine_duration[i] !== null) b.sun.push(daily.sunshine_duration[i] / 3600);
    }
    b.years.add(day.slice(0, 4));
  });
  return buckets.map((b, i) => {
    const row = {
      month: i + 1,
      avg_high_c: avg(b.high),
      avg_low_c: avg(b.low),
      rain_days: b.years.size ? round1(b.rain / b.years.size) : null,
    };
    if (extended) {
      row.wind_kmh = avg(b.wind);
      row.windy_days = b.years.size ? round1(b.windy / b.years.size) : null;
      row.sunshine_h = avg(b.sun);
    }
    return row;
  });
}

function range() {
  const lastYear = new Date().getFullYear() - 1;
  return { start_date: `${lastYear - 2}-01-01`, end_date: `${lastYear}-12-31` };
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': config.userAgent }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  return res.json();
}

async function monthlyClimate({ lat, lng }, { extended = false } = {}) {
  const daily = ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum'];
  if (extended) daily.push('wind_speed_10m_mean', 'wind_speed_10m_max', 'sunshine_duration');
  const params = new URLSearchParams({ latitude: String(lat), longitude: String(lng), ...range(), daily: daily.join(','), timezone: 'UTC' });
  const json = await getJson(`${ARCHIVE}?${params}`);
  return aggregateMonthly(json.daily);
}

// Suchpunkte: Mittelpunkt, dann Ringe bei 1/3, 2/3 und vollem Radius in 8 Richtungen (nächste zuerst)
function seaCandidates({ lat, lng }, radiusKm) {
  const out = [{ lat, lng }];
  for (const f of [1 / 3, 2 / 3, 1]) {
    const r = radiusKm * f;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      out.push({
        lat: round4(lat + (r / 111.32) * Math.cos(a)),
        lng: round4(lng + (r / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(a)),
      });
    }
  }
  return out;
}
const round4 = (x) => Math.round(x * 1e4) / 1e4;

// Nächster Kandidat mit Meeresdaten innerhalb des Radius (Antwort der Marine-API je Kandidat: Werte oder nur null)
function pickSeaPoint(center, radiusKm, candidates, results) {
  const hits = candidates
    .map((c, i) => ({ c, r: results[i] }))
    .filter(({ r }) => r && r.daily && (r.daily.sea_surface_temperature_mean || []).some((v) => v !== null))
    .map(({ c, r }) => ({ lat: r.latitude, lng: r.longitude, query: c, distance_km: round1(distanceKm(center, { lat: r.latitude, lng: r.longitude })) }))
    .filter((h) => h.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km);
  return hits[0] || null;
}

// Wassertemperatur je Monat am nächsten Meerespunkt der Region; null im Binnenland
async function seaTemperature(center, radiusKm) {
  const candidates = seaCandidates(center, radiusKm);
  const probe = new URLSearchParams({
    latitude: candidates.map((c) => c.lat).join(','), longitude: candidates.map((c) => c.lng).join(','),
    daily: 'sea_surface_temperature_mean', start_date: `${new Date().getFullYear() - 1}-07-01`, end_date: `${new Date().getFullYear() - 1}-07-03`, timezone: 'UTC',
  });
  const results = [].concat(await getJson(`${MARINE}?${probe}`));
  const point = pickSeaPoint(center, radiusKm, candidates, results);
  if (!point) return null;
  const params = new URLSearchParams({ latitude: String(point.query.lat), longitude: String(point.query.lng), ...range(), daily: 'sea_surface_temperature_mean', timezone: 'UTC' });
  const json = await getJson(`${MARINE}?${params}`);
  const buckets = Array.from({ length: 12 }, () => []);
  json.daily.time.forEach((day, i) => {
    const v = json.daily.sea_surface_temperature_mean[i];
    if (v !== null) buckets[Number(day.slice(5, 7)) - 1].push(v);
  });
  return { months: buckets.map(avg), point: { lat: point.lat, lng: point.lng, distance_km: point.distance_km } };
}

module.exports = { monthlyClimate, aggregateMonthly, seaTemperature, seaCandidates, pickSeaPoint, WINDY_KMH };
