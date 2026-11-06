#!/usr/bin/env node
// Morgenbericht von Hand versenden, z. B. als Testmail.
// Aufruf: node scripts/daily-report.js [--to adresse] [--day YYYY-MM-DD]   (Standard: DAILY_REPORT_TO, Vortag)
//         node scripts/daily-report.js --dry [--day YYYY-MM-DD]            (nur Zahlen anzeigen, nichts versenden)
const report = require('../src/services/daily-report');
const db = require('../src/db');

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};

(async () => {
  const day = arg('day') || report.previousDay();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('--day als YYYY-MM-DD angeben');
  if (process.argv.includes('--dry')) {
    console.log(JSON.stringify((await report.collect(day)).sites, null, 2));
  } else {
    const sent = await report.send({ to: arg('to'), day });
    console.log(sent ? `Morgenbericht für ${day} versendet` : `Morgenbericht für ${day} nicht versendet (siehe email_log)`);
    process.exitCode = sent ? 0 : 1;
  }
})().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
}).finally(() => db.pool && db.pool.end());
