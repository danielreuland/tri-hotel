// Wassertemperatur für vorhandene Hotels nachtragen (nächste Meereszelle ≤ 10 km; Binnenland ohne).
// Aufruf: node scripts/hotel-sea.js
require('dotenv').config();
const db = require('../src/db');
const climate = require('../src/services/climate');

(async () => {
  const list = await db.many(`SELECT DISTINCT e.id, e.name, e.lat, e.lng FROM entities e JOIN climate_monthly c ON c.entity_id = e.id WHERE e.lat IS NOT NULL ORDER BY e.name`);
  for (const e of list) {
    try {
      const sea = await climate.hotelSea({ lat: Number(e.lat), lng: Number(e.lng) });
      for (let m = 1; m <= 12; m++) await db.query('UPDATE climate_monthly SET sea_c = $3 WHERE entity_id = $1 AND month = $2', [e.id, m, sea ? sea.months[m - 1] : null]);
      await db.query(`UPDATE entities SET attributes = CASE WHEN $2::jsonb IS NULL THEN attributes - 'sea_point' ELSE attributes || jsonb_build_object('sea_point', $2::jsonb) END WHERE id = $1`,
        [e.id, sea ? JSON.stringify(sea.points[0]) : null]);
      console.log(`${e.name}: ${sea ? `${sea.points[0].distance_km} km · Aug ${sea.months[7]} °C · Mär ${sea.months[2]} °C` : 'kein Meer in 10 km'}`);
    } catch (err) {
      console.log(`${e.name}: Fehler ${err.message}`);
    }
  }
  console.log(`Fertig: ${list.length} Hotels.`);
  await db.pool.end();
})();
