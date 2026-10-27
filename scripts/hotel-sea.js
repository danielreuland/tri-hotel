// Wassertemperatur für vorhandene Hotels nachtragen (nächste Meereszelle ≤ 10 km; Binnenland ohne).
// Aufruf: node scripts/hotel-sea.js [--fehlende]   (--fehlende: nur Hotels ohne erfolgreichen Durchlauf)
// Open-Meteo begrenzt die Anfragen: Pause zwischen den Hotels, bei 429 bis zu drei Wiederholungen mit Wartezeit.
require('dotenv').config();
const db = require('../src/db');
const climate = require('../src/services/climate');

const PAUSE_MS = 2000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withRetry(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!/429/.test(err.message) || attempt >= 3) throw err;
      await sleep(30000 * (attempt + 1));
    }
  }
}

(async () => {
  const onlyMissing = process.argv.includes('--fehlende');
  const list = await db.many(
    `SELECT DISTINCT e.id, e.name, e.lat, e.lng FROM entities e JOIN climate_monthly c ON c.entity_id = e.id
      WHERE e.lat IS NOT NULL ${onlyMissing ? "AND NOT (e.attributes ? 'sea_checked_at')" : ''} ORDER BY e.name`);
  let errors = 0;
  for (const e of list) {
    try {
      const sea = await withRetry(() => climate.hotelSea({ lat: Number(e.lat), lng: Number(e.lng) }));
      for (let m = 1; m <= 12; m++) await db.query('UPDATE climate_monthly SET sea_c = $3 WHERE entity_id = $1 AND month = $2', [e.id, m, sea ? sea.months[m - 1] : null]);
      await db.query(
        `UPDATE entities SET attributes = (CASE WHEN $2::jsonb IS NULL THEN attributes - 'sea_point' ELSE attributes || jsonb_build_object('sea_point', $2::jsonb) END)
           || jsonb_build_object('sea_checked_at', now()::date) WHERE id = $1`,
        [e.id, sea ? JSON.stringify(sea.points[0]) : null]);
      console.log(`${e.name}: ${sea ? `${sea.points[0].distance_km} km · Aug ${sea.months[7]} °C · Mär ${sea.months[2]} °C` : 'kein Meer in 10 km'}`);
    } catch (err) {
      errors += 1;
      console.log(`${e.name}: Fehler ${err.message}`);
    }
    await sleep(PAUSE_MS);
  }
  console.log(`Fertig: ${list.length} Hotels, ${errors} Fehler.`);
  await db.pool.end();
})();
