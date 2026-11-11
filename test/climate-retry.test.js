const test = require('node:test');
const assert = require('node:assert/strict');
const climate = require('../src/services/climate');

const fake = (answers) => { const calls = []; const f = async () => { calls.push(1); const a = answers[Math.min(calls.length - 1, answers.length - 1)]; if (a instanceof Error) throw a; return { ok: a === 200, status: a, json: async () => ({ ok: true }) }; }; f.calls = calls; return f; };
const opts = (f) => ({ fetchImpl: f, waits: [0, 0], sleep: async () => {} });

test('Open-Meteo: 503 wird bis zu zweimal wiederholt, danach klappt der Abruf', async () => {
  const f = fake([503, 503, 200]);
  assert.deepEqual(await climate.getJson('https://x.test', opts(f)), { ok: true });
  assert.equal(f.calls.length, 3);
});

test('Open-Meteo: dauerhaft 503 -> Fehler nach drei Versuchen, Zeitüberschreitung zählt wie 503', async () => {
  const f = fake([503]);
  await assert.rejects(() => climate.getJson('https://x.test', opts(f)), /Open-Meteo 503 \(nach 3 Versuchen\)/);
  assert.equal(f.calls.length, 3);
  const t = fake([new Error('The operation was aborted due to timeout'), 200]);
  assert.deepEqual(await climate.getJson('https://x.test', opts(t)), { ok: true });
  assert.equal(t.calls.length, 2);
});

test('Open-Meteo: 400 (z. B. ungültige Koordinaten) wird nicht wiederholt', async () => {
  const f = fake([400]);
  await assert.rejects(() => climate.getJson('https://x.test', opts(f)), /^Error: Open-Meteo 400$/);
  assert.equal(f.calls.length, 1);
});
