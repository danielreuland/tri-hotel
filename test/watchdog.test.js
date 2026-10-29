const test = require('node:test');
const assert = require('node:assert');
const { evaluate, plan, message } = require('../src/lib/watchdog');

const now = new Date('2026-10-29T12:00:00Z');
const healthy = {
  disk: { percent: 14 }, memAvailableMb: 1800,
  apps: [{ name: 'tri-hotel', status: 'online', restarts: 84 }], prevRestarts: { 'tri-hotel': 83 },
  urls: [{ url: 'https://tri-hotel.de/healthz', status: 200, body: 'ok', expect: 'ok' }, { url: 'https://triprep.de/', status: 200 }],
  certs: [{ name: 'tri-hotel.de', notAfter: new Date('2027-01-14T00:00:00Z') }],
  backup: { result: 'success', finishedAt: new Date('2026-10-29T03:05:00Z') },
  failedUnits: [], pm2LogMb: 3,
};
const keys = (facts) => evaluate(facts, now).map((p) => p.key);

test('watchdog: gesunder Server meldet nichts (ein Deploy-Neustart zählt nicht)', () => {
  assert.deepStrictEqual(evaluate(healthy, now), []);
});

test('watchdog: Platte, Speicher und Logs über der Grenze', () => {
  assert.deepStrictEqual(keys({ ...healthy, disk: { percent: 85 }, memAvailableMb: 120, pm2LogMb: 7700 }), ['disk', 'memory', 'pm2logs']);
});

test('watchdog: App nicht online und Absturzschleife', () => {
  const facts = { ...healthy, apps: [{ name: 'tri-hotel', status: 'errored', restarts: 90 }, { name: 'worker', status: 'online', restarts: 500 }], prevRestarts: { 'tri-hotel': 89, worker: 10 } };
  assert.deepStrictEqual(keys(facts), ['pm2:tri-hotel:status', 'pm2:worker:restarts']);
  assert.deepStrictEqual(keys({ ...healthy, apps: [] }), ['pm2:none']);
  // erste Prüfung ohne Vorwert: keine Schleife ableitbar
  assert.deepStrictEqual(keys({ ...healthy, prevRestarts: {} }), []);
});

test('watchdog: Websites – Fehler, Zeitüberschreitung, falscher Inhalt; 404 gilt als erreichbar', () => {
  const urls = [
    { url: 'a', status: 502 }, { url: 'b', error: 'keine Antwort in 10 s' },
    { url: 'c', status: 200, body: 'db', expect: 'ok' }, { url: 'd', status: 404 },
  ];
  assert.deepStrictEqual(keys({ ...healthy, urls }), ['url:a', 'url:b', 'url:c']);
});

test('watchdog: Zertifikat unter 14 Tagen, Backup fehlgeschlagen oder zu alt, Dienst ausgefallen', () => {
  assert.deepStrictEqual(keys({ ...healthy, certs: [{ name: 'x.de', notAfter: new Date('2026-11-08T00:00:00Z') }] }), ['cert:x.de']);
  assert.deepStrictEqual(keys({ ...healthy, backup: { result: 'exit-code', finishedAt: now } }), ['backup']);
  assert.deepStrictEqual(keys({ ...healthy, backup: { result: 'success', finishedAt: new Date('2026-10-28T05:00:00Z') } }), ['backup']);
  assert.deepStrictEqual(keys({ ...healthy, backup: null, failedUnits: ['nginx.service'] }), ['unit:nginx.service']);
});

test('watchdog: plan – neu sofort, Erinnerung nach 24 h, behoben einmal', () => {
  const p = [{ key: 'disk', text: 'Platte voll' }];
  const first = plan({}, p, now);
  assert.strictEqual(first.fresh.length, 1);

  const later = plan(first.state, p, new Date(now.getTime() + 3 * 3600000));
  assert.deepStrictEqual([later.fresh.length, later.reminders.length, later.resolved.length], [0, 0, 0]);
  assert.strictEqual(message(later, 'h'), null);

  const nextDay = plan(later.state, p, new Date(now.getTime() + 25 * 3600000));
  assert.strictEqual(nextDay.reminders.length, 1);
  assert.strictEqual(nextDay.reminders[0].since, now.toISOString());

  const fixed = plan(nextDay.state, [], new Date(now.getTime() + 26 * 3600000));
  assert.deepStrictEqual(fixed.resolved.map((r) => r.key), ['disk']);
  assert.deepStrictEqual(fixed.state.problems, {});
});

test('watchdog: message – Betreff nach Lage', () => {
  const p = { key: 'disk', text: 'Platte voll', since: now.toISOString() };
  assert.strictEqual(message({ fresh: [p, p], reminders: [], resolved: [] }, 'srv').subject, '[srv] 2 Probleme');
  assert.strictEqual(message({ fresh: [], reminders: [p], resolved: [] }, 'srv').subject, '[srv] 1 Problem (Erinnerung)');
  const done = message({ fresh: [], reminders: [], resolved: [p] }, 'srv');
  assert.strictEqual(done.subject, '[srv] behoben');
  assert.match(done.text, /Behoben:\n- Platte voll/);
});
