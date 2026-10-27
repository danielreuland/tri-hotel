// Daten je Trainingsregion berechnen: Klima (mit Wind, Sonne, Wasser) und Radrevier aus OpenStreetMap.
// Aufruf: node scripts/region-data.js [--alle | --klima]   (ohne Schalter nur Regionen ohne bzw. mit veralteten Daten;
// --klima: alle Regionen, Radrevier aus dem Speicher; --alle: alles neu, auch Radrevier aus OpenStreetMap)
require('dotenv').config();
const db = require('../src/db');
const regionData = require('../src/services/region-data');

regionData.refreshAll({ force: process.argv.includes('--alle'), all: process.argv.includes('--alle') || process.argv.includes('--klima'), log: (t) => console.log(t) })
  .then((r) => { console.log(`Fertig: ${r.length} Regionen.`); return db.pool.end(); })
  .catch((err) => { console.error(err.message); process.exit(1); });
