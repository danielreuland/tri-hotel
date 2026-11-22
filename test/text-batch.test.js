'use strict';
// B-31 Punkt 4: Sammellauf für Beschreibungstexte – Reihenfolge, Kandidaten, kein Überschreiben, Budget, Sammelfreigabe.
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const test = require('node:test');
const assert = require('node:assert/strict');
const textBatch = require('../src/services/text-batch');

test('Sammellauf: Reihenfolge nach Region (Admin-Reihenfolge), ohne Region zuletzt, darin nach Score', () => {
  const regions = [
    { name: 'Insel A', lat: 39.6, lng: 2.9, radius_km: 60 },
    { name: 'Insel B', lat: 29.0, lng: -13.6, radius_km: 40 },
  ];
  const rows = [
    { id: 1, name: 'Ohne', lat: 50, lng: 10, score: 99 },
    { id: 2, name: 'B hoch', lat: 29.01, lng: -13.6, score: 80 },
    { id: 3, name: 'A niedrig', lat: 39.6, lng: 2.91, score: 50 },
    { id: 4, name: 'A hoch', lat: 39.61, lng: 2.9, score: 70 },
    { id: 5, name: 'A ohne Score', lat: 39.6, lng: 2.92, score: null },
  ];
  const out = textBatch.orderCandidates(rows, regions);
  assert.deepEqual(out.map((e) => e.id), [4, 3, 5, 2, 1]);
  assert.equal(out[0].region.name, 'Insel A');
  assert.equal(out[4].region, null);
});

test('Sammellauf: Prüfhinweise vom Typ „info“ verhindern die Sammelfreigabe nicht', () => {
  assert.equal(textBatch.warnings([{ type: 'info', text: 'x' }]).length, 0);
  assert.equal(textBatch.warnings([{ type: 'number', text: 'x' }, { type: 'info' }]).length, 1);
  assert.equal(textBatch.warnings(null).length, 0);
});

// Läuft nur mit TEST_DATABASE_URL (schema.sql, seed_criteria.sql und alle Migrationen). Testobjekte mit Präfix „b31-test-“.
// Die KI wird ersetzt (describer.generate), es entstehen keine Kosten.
const DB_URL = process.env.TEST_DATABASE_URL;

test('Datenbank: Kandidaten, Aufträge ohne Überschreiben, Budgetstopp, Sammelfreigabe nur ohne Prüfhinweis', { skip: !DB_URL && 'TEST_DATABASE_URL nicht gesetzt' }, async () => {
  const db = require('../src/db');
  const describer = require('../src/services/describer');
  const llm = require('../src/lib/llm');
  const original = describer.generate;
  const queued = [];
  textBatch.setEnqueue(async (name, data, opts) => { queued.push({ name, data, opts }); });
  const admin = await db.one(`INSERT INTO admin_users (email, password_hash) VALUES ('b31-test@example.invalid', 'x')
    ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id`);
  const rankingRows = await db.many(`SELECT * FROM rankings ORDER BY is_default DESC, created_at LIMIT 2`);
  const [ranking, other] = rankingRows;
  const add = async (slug, status = 'live', rk = ranking) => {
    const e = await db.one(`INSERT INTO entities (entity_type, name, slug, city, country, lat, lng) VALUES ($1, $2, $2, 'Test', 'ES', 39.6, 2.9) RETURNING id`,
      [rk.entity_type, slug]);
    await db.query(`INSERT INTO entity_rankings (entity_id, ranking_id, status, score, fact_score, completeness) VALUES ($1, $2, $3, 70, 70, 100)`, [e.id, rk.id, status]);
    return e.id;
  };
  try {
    await db.query(`DELETE FROM entities WHERE slug LIKE 'b31-test-%'`);
    const a = await add('b31-test-a');
    const b = await add('b31-test-b');
    const c = await add('b31-test-c');
    const withText = await add('b31-test-mit-text');
    const draft = await add('b31-test-entwurf');
    const notLive = await add('b31-test-entwurf-status', 'draft');
    const otherRanking = other ? await add('b31-test-anderes-ranking', 'live', other) : null;
    await db.query(`INSERT INTO entity_texts (entity_id, ranking_id, summary, body, status) VALUES ($1, $2, 's', 'b', 'published')`, [withText, ranking.id]);
    await db.query(`INSERT INTO entity_texts (entity_id, ranking_id, summary, body, status) VALUES ($1, $2, 's', 'b', 'draft')`, [draft, ranking.id]);

    const ids = (await textBatch.candidates(ranking)).map((x) => x.id);
    for (const id of [a, b, c]) assert.ok(ids.includes(id), 'Live ohne Text ist Kandidat');
    for (const id of [withText, draft, notLive]) assert.ok(!ids.includes(id), 'mit Text, Entwurf oder nicht live ist kein Kandidat');
    if (otherRanking) assert.ok(!ids.includes(otherRanking), 'anderes Ranking zählt nicht');

    // Start: nur passende Objekte, je Objekt höchstens ein offener Auftrag, Jobs ohne Neuversuch
    assert.equal(await textBatch.start(ranking, [a, b, c, withText], admin.id), 3);
    assert.equal(await textBatch.start(ranking, [a], admin.id), 0, 'schon in Arbeit');
    assert.equal(queued.length, 3);
    assert.ok(queued.every((q) => q.name === 'text-batch' && q.opts.retryLimit === 0));
    const item = async (entityId) => db.one('SELECT id FROM text_batch_items WHERE entity_id = $1 ORDER BY id DESC LIMIT 1', [entityId]);
    const itemStatus = async (entityId) => db.one('SELECT status, message FROM text_batch_items WHERE entity_id = $1 ORDER BY id DESC LIMIT 1', [entityId]);

    // a: Entwurf ohne Prüfhinweis
    describer.generate = async () => ({ text: { summary: 'Ein Testhotel in Test.', body: 'Ein ruhiges Haus.' }, refs: {}, checks: [], usages: [], model: 'test' });
    await textBatch.runItem((await item(a)).id);
    assert.equal((await itemStatus(a)).status, 'done');
    const ta = await db.one('SELECT status, summary FROM entity_texts WHERE entity_id = $1 AND ranking_id = $2', [a, ranking.id]);
    assert.deepEqual(ta, { status: 'draft', summary: 'Ein Testhotel in Test.' });

    // b: hat inzwischen einen Text → übersprungen, nichts überschrieben, keine KI
    await db.query(`INSERT INTO entity_texts (entity_id, ranking_id, summary, body, status) VALUES ($1, $2, 'von Hand', 'Text', 'draft')`, [b, ranking.id]);
    let called = false;
    describer.generate = async () => { called = true; throw new Error('darf nicht laufen'); };
    await textBatch.runItem((await item(b)).id);
    assert.equal(called, false);
    assert.equal((await itemStatus(b)).status, 'skipped');
    assert.equal((await db.one('SELECT summary FROM entity_texts WHERE entity_id = $1', [b])).summary, 'von Hand');

    // c: Budget erreicht → Fehler mit Hinweis, kein Text
    describer.generate = async () => { throw new llm.BudgetError('KI-Monatsbudget erreicht (30.00 von 30.00 $) – Aufruf übersprungen.'); };
    await textBatch.runItem((await item(c)).id);
    const sc = await itemStatus(c);
    assert.equal(sc.status, 'failed');
    assert.match(sc.message, /Monatsbudget/);
    assert.equal(await db.one('SELECT 1 FROM entity_texts WHERE entity_id = $1', [c]), null);
    // Ein erledigter Auftrag läuft nicht zweimal
    assert.equal(await textBatch.runItem((await item(a)).id), null);

    // Stand und Sammelfreigabe: a (ohne Hinweis) wird freigegeben, draft mit Prüfhinweis nicht
    await db.query(`UPDATE entity_texts SET checks = '[{"type":"review","text":"x"}]' WHERE entity_id = $1`, [draft]);
    const st = await textBatch.status(ranking.id);
    assert.equal(st.find((x) => x.entity_id === a).warnings, 0);
    const r = await textBatch.publishClean(ranking.id, [a, draft], admin.id);
    assert.deepEqual(r, { published: 1, skipped: 1 });
    assert.equal((await db.one('SELECT status FROM entity_texts WHERE entity_id = $1', [a])).status, 'published');
    assert.equal((await db.one('SELECT status FROM entity_texts WHERE entity_id = $1', [draft])).status, 'draft');
    const log = await db.many(`SELECT action FROM admin_actions WHERE entity_id IN ($1, $2) ORDER BY created_at`, [a, ranking.id]);
    assert.ok(log.some((l) => l.action === 'generate_text'));
    assert.ok(log.some((l) => l.action === 'text_publish'));
    assert.ok(log.some((l) => l.action === 'text_batch.start'));
  } finally {
    describer.generate = original;
    await db.query(`DELETE FROM admin_actions WHERE admin_id = $1`, [admin.id]);
    await db.query(`DELETE FROM entities WHERE slug LIKE 'b31-test-%'`);
    await db.query(`DELETE FROM admin_users WHERE id = $1`, [admin.id]);
    await db.pool.end();
  }
});
