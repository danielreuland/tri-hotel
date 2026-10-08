// Hintergrund-Jobs mit pg-boss (Postgres-basiert, kein Redis).
const PgBoss = require('pg-boss');
const config = require('../config');
const submissions = require('../services/submissions');
const inquiries = require('../services/inquiries');
const autoCheck = require('./auto-check');

let boss = null;

async function start() {
  boss = new PgBoss({ connectionString: config.databaseUrl });
  boss.on('error', (err) => console.error('[jobs]', err));
  await boss.start();

  await boss.createQueue('auto-check');
  await boss.createQueue('verify-expiry');
  await boss.createQueue('inquiry-send');
  await boss.createQueue('inquiry-daily');

  await boss.work('auto-check', async (jobs) => {
    for (const job of jobs) await autoCheck.run(job.data.submissionId);
  });

  // Unbestätigte Meldungen nach 72 h verfallen lassen (stündlich)
  await boss.work('verify-expiry', async () => {
    const n = await submissions.expireOld();
    if (n) console.log(`[jobs] ${n} Meldungen verfallen`);
  });
  await boss.schedule('verify-expiry', '0 * * * *');

  // Betreiber-Anfragen: Agent formuliert + versendet; täglich Erinnerung nach 7 Tagen, Ablauf nach 30 Tagen
  await boss.work('inquiry-send', async (jobs) => {
    for (const job of jobs) await inquiries.send(job.data.inquiryId);
  });
  await boss.work('inquiry-daily', async () => {
    const r = await inquiries.dailyMaintenance();
    if (r.expired || r.reminded) console.log(`[jobs] Anfragen: ${r.reminded} erinnert, ${r.expired} verfallen`);
  });
  await boss.schedule('inquiry-daily', '0 8 * * *');

  const enqueue = (name, data) => boss.send(name, data, { retryLimit: 2, retryDelay: 60 });
  submissions.setEnqueue(enqueue);
  inquiries.setEnqueue(enqueue);
  console.log('[jobs] gestartet');
}

async function stop() {
  if (boss) await boss.stop();
}

module.exports = { start, stop };
