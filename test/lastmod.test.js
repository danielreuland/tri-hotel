'use strict';
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const test = require('node:test');
const assert = require('node:assert/strict');

// Läuft nur mit TEST_DATABASE_URL (schema.sql, seed_criteria.sql und alle Migrationen); Testobjekte mit Präfix „b37-test-“.
const DB_URL = process.env.TEST_DATABASE_URL;

// B-37: lastmod nur bei echten Änderungen. Die nächtliche Neuberechnung (retention, 3:30) darf das Änderungsdatum nicht
// verschieben, wenn Score und Vollständigkeit gleich bleiben; geänderte Faktenwerte zählen über ihr Prüfdatum.
test('Datenbank: Neuberechnung ohne Änderung verschiebt lastmod nicht, Prüfdatum der Fakten zählt', { skip: !DB_URL && 'TEST_DATABASE_URL nicht gesetzt' }, async () => {
  const db = require('../src/db');
  const rankings = require('../src/services/rankings');
  const app = require('../src/server');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const ranking = await db.one(`SELECT r.* FROM rankings r JOIN sites s ON s.id = r.site_id WHERE s.primary_domain = 'tri-hotel.de' AND r.is_default`);
  const lastmodOf = async (slug) => {
    const xml = await (await fetch(`${origin}/sitemap.xml`, { headers: { host: 'tri-hotel.de' } })).text();
    const m = xml.match(new RegExp(`/${slug}</loc>\\s*<lastmod>([^<]+)</lastmod>`));
    return m && m[1].slice(0, 10);
  };
  // Muster-Texte des Rankings zählen für jede Objektseite mit (ranking.updated_at) – für den Test vorübergehend alt
  const rankingMod = ranking.updated_at;
  await db.query(`UPDATE rankings SET updated_at = '2024-01-01T12:00:00Z' WHERE id = $1`, [ranking.id]);
  try {
    await db.query(`DELETE FROM entities WHERE slug LIKE 'b37-test-%'`);
    const e = await db.one(`INSERT INTO entities (entity_type, name, slug, city, country, lat, lng, updated_at)
      VALUES ($1, 'b37-test-hotel', 'b37-test-hotel', 'Test', 'ES', 39.5, 2.6, '2025-01-10T12:00:00Z') RETURNING id`, [ranking.entity_type]);
    await db.query(`INSERT INTO entity_rankings (entity_id, ranking_id, status, published_at) VALUES ($1, $2, 'live', now())`, [e.id, ranking.id]);
    await rankings.recomputeEntity(e.id, ranking.id);
    // Stand „vor einem Jahr“ – danach rechnet der nächtliche Lauf mit unveränderten Daten neu
    await db.query(`UPDATE entity_rankings SET updated_at = '2025-01-10T12:00:00Z' WHERE entity_id = $1`, [e.id]);
    await rankings.recomputeEntity(e.id, ranking.id);
    await rankings.recomputeRanking(ranking.id);
    const er = await db.one(`SELECT updated_at FROM entity_rankings WHERE entity_id = $1 AND ranking_id = $2`, [e.id, ranking.id]);
    assert.equal(er.updated_at.toISOString().slice(0, 10), '2025-01-10', 'Neuberechnung ohne Änderung lässt updated_at stehen');
    assert.equal(await lastmodOf('b37-test-hotel'), '2025-01-10');

    // Neuer Faktenwert: Score ändert sich → updated_at neu; Prüfdatum des Werts zählt ebenfalls
    const c = await db.one(`SELECT id FROM criteria WHERE ranking_id = $1 AND scoring->>'type' = 'bool' AND max_points > 0 ORDER BY sort_order LIMIT 1`, [ranking.id]);
    await db.query(`INSERT INTO entity_facts (entity_id, criterion_id, value, source, trust_level, checked_at)
      VALUES ($1, $2, '{"bool": true}', 'admin', 2, '2025-06-01T12:00:00Z')`, [e.id, c.id]);
    await db.query(`UPDATE entity_rankings SET updated_at = '2025-01-10T12:00:00Z' WHERE entity_id = $1`, [e.id]);
    assert.equal(await lastmodOf('b37-test-hotel'), '2025-06-01', 'Prüfdatum des Faktenwerts zählt für lastmod');
    await rankings.recomputeEntity(e.id, ranking.id);
    const after = await db.one(`SELECT updated_at FROM entity_rankings WHERE entity_id = $1 AND ranking_id = $2`, [e.id, ranking.id]);
    assert.ok(after.updated_at > new Date('2025-06-02'), 'geänderter Score setzt updated_at neu');
  } finally {
    await db.query(`UPDATE rankings SET updated_at = $2 WHERE id = $1`, [ranking.id, rankingMod]);
    await db.query(`DELETE FROM entities WHERE slug LIKE 'b37-test-%'`);
    server.close();
    await db.pool.end();
  }
});
