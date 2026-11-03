// Messstationen (NOAA) nachtragen: Wind und Regentage je Region, Regentage je Hotel (siehe src/services/stations.js).
// Aufruf: node scripts/weather-stations.js [--regionen] [--hotels] [--fehlende]
//   ohne --regionen/--hotels: beides; --fehlende: nur Hotels ohne bisherigen Durchlauf
// Stationswerte werden zwischengespeichert – mehrere Hotels an derselben Station kosten nur einen Abruf.
require('dotenv').config();
const db = require('../src/db');
const stations = require('../src/services/stations');

const PAUSE_MS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const args = process.argv.slice(2);
  const both = !args.includes('--regionen') && !args.includes('--hotels');
  let errors = 0;
  if (both || args.includes('--regionen')) {
    const regions = await db.many(`SELECT * FROM regions WHERE status = 'active' ORDER BY sort_order, name`);
    for (const r of regions) {
      try {
        console.log(`Region ${r.name}: ${await stations.updateRegion(r)}`);
      } catch (err) {
        errors += 1;
        console.log(`Region ${r.name}: Fehler ${err.message}`);
      }
      await sleep(PAUSE_MS);
    }
  }
  if (both || args.includes('--hotels')) {
    const onlyMissing = args.includes('--fehlende');
    const list = await db.many(
      `SELECT DISTINCT e.id, e.name, e.lat, e.lng FROM entities e JOIN climate_monthly c ON c.entity_id = e.id
        WHERE e.lat IS NOT NULL ${onlyMissing ? "AND NOT (e.attributes ? 'stations_checked_at')" : ''} ORDER BY e.name`);
    for (const e of list) {
      try {
        console.log(`${e.name}: ${await stations.updateEntity(e)}`);
      } catch (err) {
        errors += 1;
        console.log(`${e.name}: Fehler ${err.message}`);
      }
      await sleep(PAUSE_MS);
    }
  }
  console.log(`Fertig, ${errors} Fehler.`);
  await db.pool.end();
})();
