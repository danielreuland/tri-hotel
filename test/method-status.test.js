// Stand der Methode (B-30): Stand-Zeile, Änderungsverlauf, dateModified und – mit Datenbank – Version je Katalogänderung
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const ejs = require('ejs');
const ms = require('../src/services/method-status');
const seo = require('../src/lib/seo');

const VIEWS = path.join(__dirname, '..', 'src', 'views');

test('Stand-Zeile: Version, Datum der Katalogänderung und der Neuberechnung aus der Ranking-Zeile (deutsche Zeit)', () => {
  const s = ms.statusOf({ catalog_version: 7, catalog_changed_at: new Date('2026-10-21T23:30:00Z'), scores_computed_at: '2026-11-18T02:30:00Z' });
  assert.equal(s.version, 7);
  assert.equal(s.changedLabel, '22.10.2026');
  assert.equal(s.changedIso, '2026-10-22');
  assert.equal(s.computedLabel, '18.11.2026');
  const empty = ms.statusOf({});
  assert.equal(empty.version, 1);
  assert.equal(empty.changedLabel, null);
  assert.equal(empty.computedLabel, null);
});

test('Änderungsverlauf: verständliche Sätze aus den erfassten Änderungen', () => {
  const t = (detail, public_text) => ms.publicText({ detail, public_text });
  assert.equal(t([{ kind: 'criterion', op: 'changed', label: 'Becken' }]), 'Kriterium „Becken“ angepasst.');
  assert.equal(t([{ kind: 'criterion', op: 'added', label: 'Sauna' }, { kind: 'criterion', op: 'added', label: 'Kältebad' }]),
    'Neue Kriterien „Sauna“ und „Kältebad“.');
  assert.equal(t([{ kind: 'criterion', op: 'removed', label: 'Klima' }, { kind: 'formula', op: 'changed' }]), 'Kriterium „Klima“ entfällt, Formel angepasst.');
  assert.equal(t([{ kind: 'category', op: 'changed', label: 'Laufen' }]), 'Bereich „Laufen“ umbenannt.');
  assert.equal(t([{ kind: 'labels', op: 'changed' }]), 'Score-Stufen angepasst.');
  // Doppelte Nennungen (mehrere Änderungen in einer Transaktion) nur einmal; mehr als zwei Namen → Anzahl
  assert.equal(t([1, 2, 3].map((i) => ({ kind: 'criterion', op: 'changed', label: `K${i}` })).concat([{ kind: 'criterion', op: 'changed', label: 'K1' }])),
    '3 Kriterien angepasst.');
  assert.equal(t([{ kind: 'ranking', op: 'created' }, { kind: 'criterion', op: 'added', label: 'A' }]), 'Erste Fassung des Kriterienkatalogs.');
  assert.equal(t([], 'Becken ist kein K.O.-Kriterium mehr.'), 'Becken ist kein K.O.-Kriterium mehr.');
});

test('Änderungsverlauf: zu technische oder unbekannte Einträge → „Kriterienkatalog überarbeitet.“', () => {
  const t = (detail) => ms.publicText({ detail });
  assert.equal(t([]), ms.FALLBACK);
  assert.equal(t(null), ms.FALLBACK);
  assert.equal(t([{ kind: 'criterion', op: 'changed' }]), ms.FALLBACK); // ohne Bezeichnung
  assert.equal(t([{ kind: 'share_key', op: 'changed', label: 'x' }]), ms.FALLBACK);
  assert.equal(t([
    { kind: 'criterion', op: 'added', label: 'A' }, { kind: 'criterion', op: 'changed', label: 'B' },
    { kind: 'criterion', op: 'removed', label: 'C' }, { kind: 'formula', op: 'changed' },
  ]), ms.FALLBACK); // mehr als drei Teile
  assert.equal(ms.FALLBACK, 'Kriterienkatalog überarbeitet.');
});

test('Verlauf aus der Datenbank: die letzten Einträge, neueste zuerst, mit Datum und Satz', async () => {
  const calls = [];
  const client = { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [
    { version: 5, changed_at: '2026-10-22T16:00:00Z', detail: [], public_text: 'Becken ist kein K.O.-Kriterium mehr.' },
    { version: 4, changed_at: '2026-10-22T10:00:00Z', detail: [{ kind: 'criterion', op: 'changed', label: 'Radrevier' }], public_text: null },
  ] }; } };
  const rows = await ms.recentChanges('r1', 5, client);
  assert.deepEqual(calls[0].params, ['r1', 5]);
  assert.match(calls[0].sql, /ORDER BY version DESC LIMIT \$2/);
  assert.deepEqual(rows[1], { version: 4, date: '22.10.2026', iso: '2026-10-22', text: 'Kriterium „Radrevier“ angepasst.' });
});

test('Neuberechnung aller Scores setzt rankings.scores_computed_at', async () => {
  const calls = [];
  await ms.markComputed('r1', { query: async (sql, params) => { calls.push({ sql, params }); return { rows: [] }; } });
  assert.match(calls[0].sql, /UPDATE rankings SET scores_computed_at = now\(\) WHERE id = \$1/);
  assert.deepEqual(calls[0].params, ['r1']);
});

test('Strukturierte Daten: WebPage mit dateModified = Datum der Methode', () => {
  const ld = ms.pageLd({ name: 'So funktioniert der TriScore', url: 'https://tri-hotel.de/triscore', site: 'https://tri-hotel.de',
    status: ms.statusOf({ catalog_version: 5, catalog_changed_at: '2026-10-22T16:00:00Z' }) });
  assert.equal(ld['@type'], 'WebPage');
  assert.equal(ld.dateModified, '2026-10-22');
  assert.equal(ld.url, 'https://tri-hotel.de/triscore');
  assert.equal(ms.pageLd({ name: 'x', url: 'u', status: ms.statusOf({}) }).dateModified, undefined);
});

// Methodik-Seite rendern (wie test/about.test.js)
const appLocals = { assetVersion: 't', ldJson: seo.ldJson, fitTitle: seo.fitTitle, fitDescription: seo.fitDescription, noindexAll: false, plausibleSrc: null };
const rk = { id: 1, is_default: true, slug: 'triathlon-hotel', score_name: 'TriScore', entity_type: 'hotel', entity_label_sg: 'Hotel', entity_label_pl: 'Hotels',
  review_config: {}, formula: {}, labels: [] };
const method = (extra) => ejs.renderFile(path.join(VIEWS, 'public', 'method.ejs'), {
  ...appLocals, title: 'So funktioniert der TriScore', site: { code: 'tri-hotel', name: 'TRI-HOTEL', legal: {} }, hostRanking: rk, ranking: rk,
  scorePath: '/triscore', listPath: '/hotels', siteMedia: { slots: {}, regions: {} }, heading: 'So funktioniert der TriScore', intro: ['Einleitung.'], faq: [],
  example: null, bestTimeRule: null, formula: { fact_weight: 0.6, athlete_weight: 0.4, bayes_c: 5, bayes_m: 70, min_completeness: 70, recheck_months: 18, min_reviews: 3 },
  categories: [], totalPoints: 106, explainScoring: () => '', listHref: '/hotels', entityPath: () => '/', ...extra,
});

test('Methodik-Seite: Stand-Zeile unter der Einleitung und aufklappbarer Änderungsverlauf', async () => {
  const status = ms.statusOf({ catalog_version: 5, catalog_changed_at: '2026-10-22T16:00:00Z', scores_computed_at: '2026-11-18T02:30:00Z' });
  const html = await method({ methodStatus: status, catalogChanges: [{ version: 5, date: '22.10.2026', iso: '2026-10-22', text: 'Becken ist kein K.O.-Kriterium mehr.' }],
    jsonLd: [ms.pageLd({ name: 'x', url: 'https://tri-hotel.de/triscore', status })] });
  const text = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
  assert.match(text, /Stand der Methode: 22\.10\.2026 · Kriterienkatalog Version 5 · Scores zuletzt berechnet am 18\.11\.2026/);
  assert.ok(html.indexOf('Einleitung.') < html.indexOf('Stand der Methode'));
  assert.match(html, /<details class="method-history">\s*<summary><small>Änderungsverlauf<\/small><\/summary>/);
  assert.match(text, /22\.10\.2026 · Version 5: Becken ist kein K\.O\.-Kriterium mehr\./);
  assert.match(html, /"dateModified":"2026-10-22"/);
  // ohne Verlauf kein leerer Aufklapper
  assert.doesNotMatch(await method({ methodStatus: status, catalogChanges: [] }), /method-history/);
});

// ---------- Mit Datenbank: Version steigt bei Katalogänderung (Trigger aus Migration 120) ----------
// Läuft nur mit TEST_DATABASE_URL (Datenbank mit schema.sql, seed_criteria.sql und allen Migrationen); alles in einer
// Transaktion, die am Ende zurückgerollt wird.
const DB_URL = process.env.TEST_DATABASE_URL;

test('Datenbank: Katalogänderung erhöht die Version einmal je Transaktion, Reihenfolge zählt nicht', { skip: !DB_URL && 'TEST_DATABASE_URL nicht gesetzt' }, async () => {
  const { Client } = require('pg');
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  const version = async (id) => (await client.query('SELECT catalog_version FROM rankings WHERE id = $1', [id])).rows[0].catalog_version;
  try {
    await client.query('BEGIN');
    const r = (await client.query(`SELECT r.id FROM rankings r WHERE EXISTS (SELECT 1 FROM criteria c WHERE c.ranking_id = r.id AND c.active) LIMIT 1`)).rows[0];
    const v0 = await version(r.id);

    // Nur Reihenfolge: keine neue Version
    await client.query('UPDATE criteria SET sort_order = sort_order + 1 WHERE ranking_id = $1', [r.id]);
    assert.equal(await version(r.id), v0);

    // Punkte geändert: +1; zweite Änderung in derselben Transaktion zählt nicht extra
    const c = (await client.query('SELECT id, label FROM criteria WHERE ranking_id = $1 AND active ORDER BY sort_order LIMIT 1', [r.id])).rows[0];
    await client.query('UPDATE criteria SET max_points = max_points + 1 WHERE id = $1', [c.id]);
    assert.equal(await version(r.id), v0 + 1);
    await client.query(`UPDATE rankings SET formula = formula || '{"b30_test": 1}' WHERE id = $1`, [r.id]);
    assert.equal(await version(r.id), v0 + 1);
    const change = (await client.query('SELECT version, detail FROM catalog_changes WHERE ranking_id = $1 ORDER BY version DESC LIMIT 1', [r.id])).rows[0];
    assert.equal(change.version, v0 + 1);
    assert.deepEqual(change.detail.map((i) => i.kind), ['criterion', 'formula']);
    assert.equal(ms.publicText(change), `Kriterium „${c.label}“ angepasst, Formel angepasst.`);
    const changed = (await client.query('SELECT catalog_changed_at FROM rankings WHERE id = $1', [r.id])).rows[0].catalog_changed_at;
    assert.ok(changed instanceof Date);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
