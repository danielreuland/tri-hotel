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
  await boss.createQueue('osm-retry');
  await boss.createQueue('retention');
  await boss.createQueue('mail-poll');
  await boss.createQueue('camp-check');
  await boss.createQueue('lead-followup');

  await boss.work('auto-check', async (jobs) => {
    for (const job of jobs) await autoCheck.run(job.data.submissionId);
  });

  // OpenStreetMap-Schritt nachholen, wenn die Overpass-Server gestört waren
  await boss.work('osm-retry', async (jobs) => {
    for (const job of jobs) await autoCheck.retryOsm(job.data.submissionId, job.data.attempt);
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

  // Camp-Anbieter automatisch qualifizieren (Website, KI-Auswertung, Hotelabgleich)
  await boss.work('camp-check', async (jobs) => {
    for (const job of jobs) await require('../services/camp-check').run(job.data.providerId);
  });

  // Camp-Anfragen: 7 Tage nach der Weitergabe beim Anbieter nach dem Ergebnis fragen (täglich 9 Uhr)
  await boss.work('lead-followup', async () => {
    const n = await require('../services/leads').sendFollowups();
    if (n) console.log(`[jobs] Camp-Anfragen: ${n} Nachfragen an Anbieter`);
  });
  await boss.schedule('lead-followup', '0 9 * * *');

  // Löschfristen (täglich 3:30 Uhr)
  await boss.work('retention', async () => {
    const r = await require('../services/retention').run();
    // Bewertungen altern (Gewichte nach Monaten) – Scores täglich neu berechnen
    const rankingsService = require('../services/rankings');
    for (const rk of await require('../db').many(`SELECT id FROM rankings WHERE status = 'active'`)) await rankingsService.recomputeRanking(rk.id);
    const n = Object.values(r).reduce((a, b) => a + b, 0);
    if (n) console.log('[jobs] Löschfristen:', JSON.stringify(r));
  });
  await boss.schedule('retention', '30 3 * * *');

  // Postfach abrufen (alle 5 Minuten), nur wenn ein Empfang konfiguriert ist
  if (config.mail.inbound.provider !== 'none') {
    await boss.work('mail-poll', async () => {
      const r = await require('../services/mailbox').poll();
      if (r.stored || r.errors) console.log(`[jobs] Postfach: ${r.stored} neu, ${r.errors} Fehler`);
    });
    await boss.schedule('mail-poll', '*/5 * * * *', null, { retryLimit: 0 });
  } else {
    await boss.unschedule('mail-poll').catch(() => {});
  }

  const enqueue = (name, data, opts = {}) => boss.send(name, data, { retryLimit: 2, retryDelay: 60, ...opts });
  submissions.setEnqueue(enqueue);
  inquiries.setEnqueue(enqueue);
  require('../services/camp-check').setEnqueue(enqueue);
  console.log('[jobs] gestartet');
}

async function stop() {
  if (boss) await boss.stop();
}

module.exports = { start, stop };
