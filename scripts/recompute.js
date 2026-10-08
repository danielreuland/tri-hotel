// Berechnet die Scores aller Rankings neu (z. B. nach einer Katalog-Migration).
// Aufruf: npm run recompute
const { pool } = require('../src/db');
const rankings = require('../src/services/rankings');

async function main() {
  const { rows } = await pool.query('SELECT id, name FROM rankings');
  for (const r of rows) {
    const n = await rankings.recomputeRanking(r.id);
    console.log(`${r.name}: ${n} Scores neu berechnet`);
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
