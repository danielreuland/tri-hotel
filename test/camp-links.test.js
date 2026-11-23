if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const test = require('node:test');
const assert = require('node:assert/strict');
const camps = require('../src/services/camps');

const entities = [
  { id: 'a', name: 'Club La Santa', city: 'Tinajo' },
  { id: 'b', name: 'Playitas Hotel', city: 'Las Playitas' },
  { id: 'c', name: 'Playitas Aparthotel', city: 'Las Playitas' },
  { id: 'd', name: 'Aktivhotel Santa Lucia', city: 'Torbole' },
];

test('suggestEntity: gleicher Name trotz „Hotel“, Akzenten und Schreibweise', () => {
  assert.equal(camps.suggestEntity({ hotel_name: 'Hotel Club La Santa' }, entities).entity.id, 'a');
  assert.equal(camps.suggestEntity({ hotel_name: 'Aktivhotel SantaLucía' }, entities).entity.id, 'd');
  assert.equal(camps.suggestEntity({ hotel_name: 'Club La Santa' }, entities).exact, true);
});

test('suggestEntity: mehrdeutig ohne Ort → kein Vorschlag, mit passendem Ort → der Treffer im Ort', () => {
  const two = [{ id: 'x', name: 'Seehotel', city: 'Kaprun' }, { id: 'y', name: 'Seehotel', city: 'Fuschl' }];
  assert.equal(camps.suggestEntity({ hotel_name: 'Seehotel' }, two), null);
  assert.equal(camps.suggestEntity({ hotel_name: 'Seehotel', place: 'Fuschl' }, two).entity.id, 'y');
});

test('suggestEntity: nichts Passendes → null', () => {
  assert.equal(camps.suggestEntity({ hotel_name: 'Hotel Bergblick', place: 'Oberstdorf' }, entities), null);
  assert.equal(camps.suggestEntity({ hotel_name: '' }, entities), null);
});

test('sameHotel: gleicher Name (Akzente, „Hotel“, Schreibweise egal) → Dublette, ähnlicher Name nicht', () => {
  const e = { id: 'e', name: 'Allsun Hotel Bella Paguera' };
  assert.equal(camps.sameHotel({ hotel_name: 'Allsun Hotel Bella Paguera' }, e), true);
  assert.equal(camps.sameHotel({ hotel_name: 'allsun bella paguera' }, e), true);
  assert.equal(camps.sameHotel({ hotel_name: 'Club Pollentia Resort' }, { name: 'PortBlue Club Pollentia Resort' }), false);
  assert.equal(camps.sameHotel({ hotel_name: '' }, e), false);
});

// ---------- Mit Datenbank: keine doppelten Hotel-Zeilen beim Anbieter ----------
// Läuft nur mit TEST_DATABASE_URL (schema.sql, seed_criteria.sql und alle Migrationen). Legt Testdaten mit Präfix
// „camp-dup-test-“ an und löscht sie am Ende wieder.
const DB_URL = process.env.TEST_DATABASE_URL;

test('Datenbank: freie Zeile + Verknüpfung desselben Hotels → eine Zeile (Speichern und Migration 129)', { skip: !DB_URL && 'TEST_DATABASE_URL nicht gesetzt' }, async () => {
  const fs = require('fs');
  const path = require('path');
  const db = require('../src/db');
  const site = await db.one(`SELECT id FROM sites WHERE primary_domain = 'tri-hotel.de'`);
  const rows = (pid) => db.many('SELECT * FROM camp_provider_hotels WHERE provider_id = $1 ORDER BY sort_order', [pid]);
  try {
    await db.query(`DELETE FROM camp_providers WHERE slug LIKE 'camp-dup-test-%'`);
    await db.query(`DELETE FROM entities WHERE slug LIKE 'camp-dup-test-%'`);
    const e = await db.one(`INSERT INTO entities (entity_type, name, slug, city, country) VALUES ('hotel', 'Allsun Hotel Bella Paguera', 'camp-dup-test-allsun', 'Paguera', 'ES') RETURNING *`);
    const p = await db.one(`INSERT INTO camp_providers (site_id, slug, name, model, website, status) VALUES ($1, 'camp-dup-test-a', 'Test', 'coach', 'https://example.org', 'draft') RETURNING id`, [site.id]);
    await db.query(`INSERT INTO camp_provider_hotels (provider_id, hotel_name, place, region, sort_order, evidence_url, evidence_text)
                    VALUES ($1, 'Allsun Hotel Bella Paguera', 'Paguera, Mallorca', 'Mallorca', 0, 'https://example.org/camp', 'im Allsun')`, [p.id]);

    // Speichern: Objekt gewählt, freie Zeile im Textfeld stehen gelassen → alte freie Zeile wird zur Verknüpfung
    const free = [{ hotel_name: 'Allsun Hotel Bella Paguera', place: 'Paguera, Mallorca', region: 'Mallorca' }, { hotel_name: 'Club Pollentia Resort', place: 'Alcúdia' }];
    const r = await db.tx((c) => camps.saveProviderHotels(c, p.id, { entityIds: [e.id], free }));
    let list = await rows(p.id);
    assert.equal(list.length, 2);
    assert.equal(list[0].entity_id, e.id);
    assert.equal(list[0].evidence_url, 'https://example.org/camp', 'Fundstelle der freien Zeile bleibt');
    assert.equal(list[1].hotel_name, 'Club Pollentia Resort');
    assert.equal(list[1].entity_id, null);
    assert.deepEqual(r.removed, []);

    // Migration 129: vorhandene Dublette (wie live bei Jorge Sports) wird entfernt, Fundstelle wandert mit
    await db.query('UPDATE camp_provider_hotels SET evidence_url = NULL, evidence_text = NULL WHERE provider_id = $1 AND entity_id IS NOT NULL', [p.id]);
    await db.query(`INSERT INTO camp_provider_hotels (provider_id, hotel_name, place, region, sort_order, evidence_url, evidence_text)
                    VALUES ($1, 'Allsun Hotel  Bella Paguera', 'Paguera, Mallorca', 'Mallorca', 5, 'https://example.org/alt', 'alt')`, [p.id]);
    assert.equal((await rows(p.id)).length, 3);
    const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'migrations', '129_camp_hotel_duplicates.sql'), 'utf8');
    await db.tx((c) => c.query(sql));
    list = await rows(p.id);
    assert.equal(list.length, 2);
    assert.equal(list.filter((h) => /allsun/i.test(h.hotel_name)).length, 1);
    assert.equal(list[0].evidence_url, 'https://example.org/alt');
  } finally {
    await db.query(`DELETE FROM camp_providers WHERE slug LIKE 'camp-dup-test-%'`);
    await db.query(`DELETE FROM entities WHERE slug LIKE 'camp-dup-test-%'`);
    await db.pool.end();
  }
});
