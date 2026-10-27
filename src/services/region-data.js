// Trainingsregionen, Schritt 1: Daten je Region unabhängig von Hotels.
// - Klima je Monat am Klimapunkt der Region (Open-Meteo, mit Wind und Sonne): vom Admin gesetzt, sonst Lage der Hotels,
//   (ab MIN_HOTELS Hotels), sonst ein tiefer gelegener Ort nahe der Mitte – der Mittelpunkt liegt auf Inseln oft im Gebirge (Teneriffa: Teide)
// - Wassertemperatur vor der Küste: Mittel der küstennächsten Meereszellen in bis zu 8 Richtungen (Binnenregionen ohne)
// - Radrevier aus OpenStreetMap (bike_areas, gleiche Regel und Berechnung wie für die Hotels)
// Aktualisierung: per Knopf im Admin oder automatisch, wenn älter als MAX_AGE_DAYS.
const db = require('../db');
const climate = require('./climate');
const geo = require('./geo');
const bikeArea = require('./bike-area');
const { logAction } = require('../lib/audit');

const MAX_AGE_DAYS = 365;
const PAUSE_MS = 20000;
const LOW_M = 400;
const MIN_HOTELS = 3;  // darunter entscheidet bei der Hotel-Lage der Zufall (bei 2 Hotels liegt keins „mittiger“)   // „tiefer gelegen“: Orte bis zu dieser Höhe kommen als Klimapunkt in Frage

// Hotel, das den anderen am nächsten liegt (Medoid) – ein echter Ort, kein Mittelwert zwischen Nord- und Südküste
function medoid(points) {
  let best = null;
  for (const p of points) {
    const sum = points.reduce((acc, q) => acc + geo.distanceKm(p, q), 0);
    if (!best || sum < best.sum) best = { p, sum };
  }
  return best ? best.p : null;
}

// Rasterpunkte für die automatische Wahl: Mittelpunkt und Ringe bei 1/4, 1/2, 3/4 des Radius in 8 Richtungen
function climateCandidates(center, radiusKm) {
  return climate.seaCandidates(center, radiusKm, [0.25, 0.5, 0.75]);
}

// Klimapunkt wählen. override: {lat, lng} aus dem Admin; hotels: [{lat, lng, city}] in der Region (zählt ab MIN_HOTELS);
// samples: Rasterpunkte mit elevation (Meer = 0). Rückgabe {lat, lng, source, place}
function pickClimatePoint(center, { override = null, hotels = [], samples = [] } = {}) {
  if (override) return { lat: override.lat, lng: override.lng, source: 'admin', place: null };
  const m = hotels.length >= MIN_HOTELS ? medoid(hotels) : null;
  if (m) return { lat: m.lat, lng: m.lng, source: 'hotels', place: m.city || null };
  const land = samples.filter((p) => p.elevation > 0);
  const low = land.filter((p) => p.elevation <= LOW_M);
  const pick = low.length
    ? low.reduce((a, b) => (geo.distanceKm(center, b) < geo.distanceKm(center, a) ? b : a))
    : land.length ? land.reduce((a, b) => (b.elevation < a.elevation ? b : a)) : null;
  return pick ? { lat: pick.lat, lng: pick.lng, source: 'auto', place: null } : { lat: center.lat, lng: center.lng, source: 'center', place: null };
}

// Hotels (live in irgendeinem Ranking) innerhalb des Regionsradius
async function hotelsIn(region) {
  const center = { lat: Number(region.lat), lng: Number(region.lng) };
  const rows = await db.many(
    `SELECT DISTINCT e.id, e.lat, e.lng, e.city FROM entities e JOIN entity_rankings er ON er.entity_id = e.id AND er.status = 'live'
      WHERE e.lat IS NOT NULL AND e.lng IS NOT NULL`);
  return rows.map((r) => ({ lat: Number(r.lat), lng: Number(r.lng), city: r.city }))
    .filter((p) => geo.distanceKm(center, p) <= Number(region.radius_km));
}

async function climatePoint(region) {
  const center = { lat: Number(region.lat), lng: Number(region.lng) };
  const override = region.climate_lat !== null && region.climate_lat !== undefined && region.climate_lng !== null && region.climate_lng !== undefined
    ? { lat: Number(region.climate_lat), lng: Number(region.climate_lng) } : null;
  const hotels = override ? [] : await hotelsIn(region);
  let samples = [];
  if (!override && hotels.length < MIN_HOTELS) {
    const cands = climateCandidates(center, Number(region.radius_km));
    const elev = await geo.elevations(cands);
    samples = cands.map((c, i) => ({ ...c, elevation: elev[i] }));
  }
  const point = pickClimatePoint(center, { override, hotels, samples });
  const [elevation] = await geo.elevations([point]);
  return { ...point, lat: Number(point.lat.toFixed(5)), lng: Number(point.lng.toFixed(5)), elevation_m: elevation === undefined ? null : Math.round(elevation) };
}

// sea === undefined: Wassertemperatur nicht neu ermittelt (Fehler) – vorhandene Werte bleiben stehen
async function saveClimate(regionId, months, sea) {
  await db.tx(async (c) => {
    for (const m of months) {
      await c.query(
        `INSERT INTO region_climate_monthly (region_id, month, avg_high_c, avg_low_c, rain_days, wind_kmh, windy_days, sunshine_h, sea_c)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (region_id, month) DO UPDATE SET avg_high_c = EXCLUDED.avg_high_c, avg_low_c = EXCLUDED.avg_low_c,
           rain_days = EXCLUDED.rain_days, wind_kmh = EXCLUDED.wind_kmh, windy_days = EXCLUDED.windy_days,
           sunshine_h = EXCLUDED.sunshine_h, sea_c = CASE WHEN $10 THEN region_climate_monthly.sea_c ELSE EXCLUDED.sea_c END`,
        [regionId, m.month, m.avg_high_c, m.avg_low_c, m.rain_days, m.wind_kmh, m.windy_days, m.sunshine_h,
          sea ? sea.months[m.month - 1] : null, sea === undefined]);
    }
  });
}

// Eine Region aktualisieren. Rückgabe: kurze Zusammenfassung (für Admin und Skript)
async function refresh(region, { force = false, adminId = null } = {}) {
  const parts = [];
  const errors = [];
  const center = { lat: Number(region.lat), lng: Number(region.lng) };
  try {
    const point = await climatePoint(region);
    const months = await climate.monthlyClimate(point, { extended: true });
    let sea = null;
    try {
      sea = await climate.seaTemperature(center, Number(region.radius_km), { mode: 'coast' });
    } catch (err) {
      sea = undefined;
      errors.push(`Wassertemperatur: ${err.message} (bisherige Werte bleiben)`);
    }
    await saveClimate(region.id, months, sea);
    await db.query(`UPDATE regions SET sea_point = CASE WHEN $4 THEN sea_point ELSE $2::jsonb END, climate_point = $3 WHERE id = $1`,
      [region.id, sea ? JSON.stringify({ points: sea.points }) : null, JSON.stringify(point), sea === undefined]);
    parts.push(`Klima 12 Monate (${climatePointText(point)})${sea ? `, Wasser aus ${sea.points.length} Küstenpunkten` : sea === null ? ', Binnenregion (kein Meer im Radius)' : ''}`);
  } catch (err) {
    errors.push(`Klima: ${err.message}`);
  }
  // Radrevier mit der Regel des Ranking-Kriteriums (je Site); ohne Regel kein Radrevier
  const crit = (await bikeArea.bikeCriteria()).find((c) => c.rule);
  if (crit) {
    try {
      const area = bikeArea.areaFor(center, [region], crit.rule);
      const row = await bikeArea.getArea(area, crit.rule, { force });
      parts.push(`Radrevier ${row.score} von 6`);
    } catch (err) {
      errors.push(`Radrevier: ${err.message}`);
    }
  }
  await db.query('UPDATE regions SET data_computed_at = now(), data_error = $2 WHERE id = $1', [region.id, errors.join(' · ') || null]);
  if (adminId) await logAction(adminId, 'region', region.id, 'refresh_region_data', { result: parts, errors });
  return { ok: !errors.length, text: [...parts, ...errors].join(' · ') };
}

// Alle aktiven Regionen ohne oder mit veralteten Daten (all: alle Regionen; force: zusätzlich Radrevier neu aus OSM)
async function refreshAll({ force = false, all = force, log = () => {} } = {}) {
  const list = await db.many(
    `SELECT * FROM regions WHERE status = 'active' AND ($1 OR data_computed_at IS NULL OR data_error IS NOT NULL
       OR data_computed_at < now() - make_interval(days => $2)) ORDER BY sort_order, name`, [all, MAX_AGE_DAYS]);
  const out = [];
  for (const [i, r] of list.entries()) {
    if (i) await new Promise((ok) => setTimeout(ok, PAUSE_MS));   // Open-Meteo drosselt bei vielen Anfragen am Stück (429)
    const res = await refresh(r, { force });
    log(`${r.name}: ${res.text}`);
    out.push({ region: r.name, ...res });
  }
  return out;
}

const SOURCES = { admin: 'vom Admin gesetzt', hotels: 'Lage der Hotels', auto: 'tiefer gelegener Ort nahe der Mitte', center: 'Mittelpunkt' };
function climatePointText(p) {
  if (!p) return '';
  return [p.place, p.elevation_m !== null && p.elevation_m !== undefined ? `${p.elevation_m} m` : null, SOURCES[p.source]].filter(Boolean).join(', ');
}

async function climateOf(regionId) {
  return db.many('SELECT * FROM region_climate_monthly WHERE region_id = $1 ORDER BY month', [regionId]);
}

module.exports = { MAX_AGE_DAYS, LOW_M, MIN_HOTELS, refresh, refreshAll, climateOf, pickClimatePoint, climatePointText, medoid };
