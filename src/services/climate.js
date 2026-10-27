// Klima je Monat aus Open-Meteo (Archiv der letzten drei vollen Jahre).
// avg_high_c / avg_low_c = Mittel der Tageshöchst-/-tiefstwerte, rain_days = Tage mit ≥ 1 mm Niederschlag.
// Erweitert (Regionen): wind_kmh = mittlere Windgeschwindigkeit, windy_days = Tage mit Spitzenwind ≥ 40 km/h,
// sunshine_h = Sonnenstunden je Tag; Wassertemperatur separat über die Marine-API (seaTemperature, hotelSea):
// Modellwerte vor der Küste (Raster etwa 8–9 km) – am Strand bzw. in Buchten kann es wärmer sein (Hinweis auf der Seite).
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

// Suchpunkte: Mittelpunkt, dann Ringe (Anteile des Radius) in 8 Richtungen; Reihenfolge: Ring für Ring
function seaCandidates({ lat, lng }, radiusKm, fractions = [1 / 3, 2 / 3, 1]) {
  const out = [{ lat, lng, ring: 0, dir: null }];
  fractions.forEach((f, ri) => {
    const r = radiusKm * f;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      out.push({
        lat: round4(lat + (r / 111.32) * Math.cos(a)),
        lng: round4(lng + (r / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.sin(a)),
        ring: ri + 1, dir: k,
      });
    }
  });
  return out;
}
const round4 = (x) => Math.round(x * 1e4) / 1e4;

const hasSea = (r) => r && r.daily && (r.daily.sea_surface_temperature_mean || []).some((v) => v !== null);
const hitOf = (center, c, r) => ({ lat: r.latitude, lng: r.longitude, query: c, distance_km: round1(distanceKm(center, { lat: r.latitude, lng: r.longitude })) });

// Hotel: nächste Meeres-Rasterzelle innerhalb des Radius
function pickSeaPoint(center, radiusKm, candidates, results) {
  const hits = candidates
    .map((c, i) => ({ c, r: results[i] }))
    .filter(({ r }) => hasSea(r))
    .map(({ c, r }) => hitOf(center, c, r))
    .filter((h) => h.distance_km <= radiusKm)
    .sort((a, b) => a.distance_km - b.distance_km);
  return hits[0] || null;
}

// Region: je Richtung die küstennächste Meereszelle (innerster Ring mit Wasser), doppelte Zellen nur einmal – bis zu 8 Punkte
function pickCoastPoints(center, radiusKm, candidates, results) {
  const byDir = new Map();
  candidates.forEach((c, i) => {
    const r = results[i];
    if (!hasSea(r)) return;
    const h = hitOf(center, c, r);
    if (h.distance_km > radiusKm) return;
    const key = c.dir === null ? 'center' : c.dir;
    const old = byDir.get(key);
    if (!old || c.ring < old.query.ring) byDir.set(key, h);
  });
  const seen = new Set();
  return [...byDir.values()].filter((h) => {
    const k = `${h.lat},${h.lng}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function probe(candidates) {
  const year = new Date().getFullYear() - 1;
  const params = new URLSearchParams({
    latitude: candidates.map((c) => c.lat).join(','), longitude: candidates.map((c) => c.lng).join(','),
    daily: 'sea_surface_temperature_mean', start_date: `${year}-07-01`, end_date: `${year}-07-03`, timezone: 'UTC',
  });
  return [].concat(await getJson(`${MARINE}?${params}`));
}

// Monatsmittel über mehrere Meerespunkte (ein Aufruf, drei Jahre)
async function seaMonthly(points) {
  const params = new URLSearchParams({
    latitude: points.map((p) => p.query.lat).join(','), longitude: points.map((p) => p.query.lng).join(','),
    ...range(), daily: 'sea_surface_temperature_mean', timezone: 'UTC',
  });
  const buckets = Array.from({ length: 12 }, () => []);
  for (const json of [].concat(await getJson(`${MARINE}?${params}`))) {
    json.daily.time.forEach((day, i) => {
      const v = json.daily.sea_surface_temperature_mean[i];
      if (v !== null) buckets[Number(day.slice(5, 7)) - 1].push(v);
    });
  }
  return buckets.map(avg);
}

// Wassertemperatur vor der Küste (Modell, Raster ca. 5 km). mode 'nearest' (Hotel) oder 'coast' (Region: Mittel der Küste).
// Rückgabe: { months: [12], points: [{lat, lng, distance_km}] } oder null (kein Meer im Radius)
async function seaTemperature(center, radiusKm, { mode = 'coast', fractions } = {}) {
  const candidates = seaCandidates(center, radiusKm, fractions);
  const results = await probe(candidates);
  const points = mode === 'nearest'
    ? [pickSeaPoint(center, radiusKm, candidates, results)].filter(Boolean)
    : pickCoastPoints(center, radiusKm, candidates, results);
  if (!points.length) return null;
  return { months: await seaMonthly(points), points: points.map((p) => ({ lat: p.lat, lng: p.lng, distance_km: p.distance_km })) };
}

// Hotel: Die Marine-API liefert zu jedem Punkt die nächste Meereszelle ihres Rasters (etwa 8–9 km, Buchten oft nicht
// aufgelöst) – an flachen Küsten manchmal eine weit entfernte. Deshalb Hotelpunkt plus Punkte in 3 und 6 km rundum
// abfragen (ein Aufruf) und die nächste Zelle nehmen; sie zählt, wenn sie höchstens HOTEL_SEA_KM entfernt ist.
const HOTEL_SEA_KM = 20;
async function hotelSea(point) {
  const candidates = seaCandidates(point, 6, [0.5, 1]);
  const hit = pickSeaPoint(point, HOTEL_SEA_KM, candidates, await probe(candidates));
  if (!hit) return null;
  return { months: await seaMonthly([hit]), points: [{ lat: hit.lat, lng: hit.lng, distance_km: hit.distance_km }] };
}

module.exports = { monthlyClimate, aggregateMonthly, seaTemperature, hotelSea, seaCandidates, pickSeaPoint, pickCoastPoints, WINDY_KMH, HOTEL_SEA_KM };
