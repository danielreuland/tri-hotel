// Trainingsregionen, Schritt 1: Daten je Region unabhängig von Hotels.
// - Klima je Monat am Regionsmittelpunkt (Open-Meteo, mit Wind und Sonne)
// - Wassertemperatur am nächsten Meerespunkt innerhalb der Region (Binnenregionen ohne)
// - Radrevier aus OpenStreetMap (bike_areas, gleiche Regel und Berechnung wie für die Hotels)
// Aktualisierung: per Knopf im Admin oder automatisch, wenn älter als MAX_AGE_DAYS.
const db = require('../db');
const climate = require('./climate');
const bikeArea = require('./bike-area');
const { logAction } = require('../lib/audit');

const MAX_AGE_DAYS = 365;

async function saveClimate(regionId, months, sea) {
  await db.tx(async (c) => {
    for (const m of months) {
      await c.query(
        `INSERT INTO region_climate_monthly (region_id, month, avg_high_c, avg_low_c, rain_days, wind_kmh, windy_days, sunshine_h, sea_c)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (region_id, month) DO UPDATE SET avg_high_c = EXCLUDED.avg_high_c, avg_low_c = EXCLUDED.avg_low_c,
           rain_days = EXCLUDED.rain_days, wind_kmh = EXCLUDED.wind_kmh, windy_days = EXCLUDED.windy_days,
           sunshine_h = EXCLUDED.sunshine_h, sea_c = EXCLUDED.sea_c`,
        [regionId, m.month, m.avg_high_c, m.avg_low_c, m.rain_days, m.wind_kmh, m.windy_days, m.sunshine_h, sea ? sea.months[m.month - 1] : null]);
    }
  });
}

// Eine Region aktualisieren. Rückgabe: kurze Zusammenfassung (für Admin und Skript)
async function refresh(region, { force = false, adminId = null } = {}) {
  const parts = [];
  const errors = [];
  const center = { lat: Number(region.lat), lng: Number(region.lng) };
  try {
    const months = await climate.monthlyClimate(center, { extended: true });
    let sea = null;
    try {
      sea = await climate.seaTemperature(center, Number(region.radius_km));
    } catch (err) {
      errors.push(`Wassertemperatur: ${err.message}`);
    }
    await saveClimate(region.id, months, sea);
    await db.query('UPDATE regions SET sea_point = $2 WHERE id = $1', [region.id, sea ? JSON.stringify(sea.point) : null]);
    parts.push(`Klima 12 Monate${sea ? `, Wasser ${sea.point.distance_km} km vom Mittelpunkt` : ', Binnenregion (kein Meer im Radius)'}`);
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

// Alle aktiven Regionen ohne oder mit veralteten Daten (force: alle)
async function refreshAll({ force = false, log = () => {} } = {}) {
  const list = await db.many(
    `SELECT * FROM regions WHERE status = 'active' AND ($1 OR data_computed_at IS NULL OR data_error IS NOT NULL
       OR data_computed_at < now() - make_interval(days => $2)) ORDER BY sort_order, name`, [force, MAX_AGE_DAYS]);
  const out = [];
  for (const r of list) {
    const res = await refresh(r, { force });
    log(`${r.name}: ${res.text}`);
    out.push({ region: r.name, ...res });
  }
  return out;
}

async function climateOf(regionId) {
  return db.many('SELECT * FROM region_climate_monthly WHERE region_id = $1 ORDER BY month', [regionId]);
}

module.exports = { MAX_AGE_DAYS, refresh, refreshAll, climateOf };
