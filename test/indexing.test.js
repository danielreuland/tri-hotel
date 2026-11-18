// B-46: Indexierungsregeln je Seitentyp, „weitere Objekte“, Dubletten-Suche, robots-Meta, Sitemap und alte Slugs.
// Datenbank für den letzten Test vor allen anderen Modulen setzen (src/config liest DATABASE_URL beim ersten Laden)
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const ejs = require('ejs');
const areas = require('../src/services/areas');
const camps = require('../src/services/camps');
const dup = require('../src/lib/duplicates');

const tri = { formula: { region_min_entities: 2 } };
// Zweites Ranking mit eigenen Schwellen: nichts darf Triathlon-spezifisch sein
const hyrox = { formula: { region_min_entities: 4, country_min_entities: 6 } };

test('Region: ab Mindestzahl Objekte mit Score und nur mit Einleitungstext indexierbar', () => {
  assert.equal(areas.areaIndexable('region', { scored: 2, hasText: true }, tri), true);
  assert.equal(areas.areaIndexable('region', { scored: 1, hasText: true }, tri), false);
  assert.equal(areas.areaIndexable('region', { scored: 5, hasText: false }, tri), false);
  assert.equal(areas.areaIndexable('region', { scored: 3, hasText: true }, hyrox), false);
  assert.equal(areas.areaIndexable('region', { scored: 4, hasText: true }, hyrox), true);
  assert.deepEqual(areas.indexGaps('region', { scored: 1, hasText: false }, tri), ['1 Objekt mit Score', 'Einleitungstext']);
  assert.deepEqual(areas.indexGaps('region', { scored: 2, hasText: true }, tri), []);
});

test('Land: Standard ab 3 Objekten mit Score, Schwelle aus rankings.formula', () => {
  assert.deepEqual(areas.indexRules(tri), { region: 2, country: 3 });
  assert.deepEqual(areas.indexRules({ formula: {} }), { region: 2, country: 3 });
  assert.deepEqual(areas.indexRules(hyrox), { region: 4, country: 6 });
  assert.equal(areas.areaIndexable('country', { scored: 2 }, tri), false);
  assert.equal(areas.areaIndexable('country', { scored: 3 }, tri), true);
  assert.equal(areas.areaIndexable('country', { scored: 5 }, hyrox), false);
  assert.deepEqual(areas.indexGaps('country', { scored: 1 }, tri), ['2 Objekte mit Score']);
});

test('Camp-Anbieter: indexierbar ab 50 Wörtern Kurzprofil, Preisbeispiele keine Pflicht', () => {
  const words = (n) => ({ summary: Array(n).fill('Wort').join(' '), prices: [] });
  assert.equal(camps.MIN_PROFILE_WORDS, 50);
  assert.equal(camps.indexable(words(49)), false);
  assert.equal(camps.indexable(words(50)), true);
  assert.equal(camps.indexable({ summary: null, prices: [{ price: '999 €' }] }), false);
});

test('Weitere Objekte: Region nach Score, aufgefüllt mit den nächsten im Land nach Entfernung; ohne Region nur Land', () => {
  const region = { lat: 39.6, lng: 2.9, radius_km: 50 };
  const me = { id: 'me', country: 'ES', lat: 39.6, lng: 2.9 };
  const ranked = [
    { id: 'me', country: 'ES', lat: 39.6, lng: 2.9, score: 90 },
    { id: 'r1', country: 'ES', lat: 39.7, lng: 2.9, score: 80, partner: true },
    { id: 'far', country: 'ES', lat: 41.4, lng: 2.2, score: 79 },
    { id: 'near', country: 'ES', lat: 39.0, lng: 1.4, score: 50 },
    { id: 'it', country: 'IT', lat: 45.6, lng: 10.6, score: 99 },
  ];
  const withRegion = areas.nearbyEntities(me, ranked, region, { limit: 3 });
  assert.deepEqual(withRegion.items.map((e) => e.id), ['r1', 'near', 'far']);
  assert.equal(withRegion.scope, 'mixed');
  const noRegion = areas.nearbyEntities(me, ranked, null, { limit: 2 });
  assert.deepEqual(noRegion.items.map((e) => e.id), ['r1', 'near'], 'nach Entfernung, nicht nach Score oder Partnerstatus');
  assert.equal(noRegion.scope, 'country');
  assert.ok(noRegion.items.every((e) => e.country === 'ES'));
  const full = areas.nearbyEntities(me, ranked, { lat: 39.6, lng: 2.9, radius_km: 500 }, { limit: 2 });
  assert.equal(full.scope, 'region');
  assert.deepEqual(areas.nearbyEntities({ id: 'x', country: 'ES' }, ranked, null).items, [], 'ohne Koordinaten keine Entfernung');
});

test('Dubletten: nahe Koordinaten, ähnlicher Name oder gleiche Website-Adresse – nur als Hinweis', () => {
  const items = [
    { id: 1, entity_type: 'hotel', name: 'Zafiro Palace Alcudia', lat: 39.8446, lng: 3.1345, website: 'https://www.zafirohotels.com/de/hotels/zafiro-palace-alcudia/' },
    { id: 2, entity_type: 'hotel', name: 'Zafirco Palace Alcúdia', lat: 39.7700, lng: 3.1500, website: 'https://zafirohotels.com/de/hotels/zafiro-palace-alcudia' },
    { id: 3, entity_type: 'hotel', name: 'Hotel Bernat II', lat: 41.3830, lng: 2.1750, website: 'https://bernat.example/' },
    { id: 4, entity_type: 'hotel', name: 'Sant Jordi Boutique Hotel', lat: 41.3840, lng: 2.1760, website: 'https://jordi.example/' },
    { id: 5, entity_type: 'gym', name: 'Hotel Bernat II', lat: 41.3830, lng: 2.1750 },
  ];
  const pairs = dup.findPairs(items);
  assert.equal(pairs.length, 2, 'verschiedene Objekttypen werden nicht verglichen');
  assert.deepEqual([pairs[0].a.id, pairs[0].b.id], [1, 2]);
  assert.ok(pairs[0].strong && pairs[0].sameSite);
  assert.match(pairs[0].reasons.join(' '), /Name ähnlich/);
  assert.deepEqual([pairs[1].a.id, pairs[1].b.id], [3, 4]);
  assert.equal(pairs[1].strong, false);
  assert.equal(dup.siteKey('https://chain.example/'), null, 'nur Domain ohne Pfad zählt nicht (Ketten)');
  assert.equal(dup.normName('Hotel Globales Janeiro & Spa'), 'globales janeiro');
});

test('robots-Meta: noindex-Seiten lassen Links folgen, Vorab-Sperre bleibt nofollow', async () => {
  const head = path.join(__dirname, '..', 'src', 'views', 'partials', 'head.ejs');
  const render = (locals) => ejs.renderFile(head, { title: 't', assetVersion: 't', ldJson: () => '', fitTitle: (s) => s, fitDescription: (s) => s, ...locals });
  assert.match(await render({ noindex: true }), /<meta name="robots" content="noindex, follow">/);
  assert.match(await render({ noindexAll: true }), /<meta name="robots" content="noindex, nofollow">/);
  assert.doesNotMatch(await render({ noindex: false }), /name="robots"/);
});

// ---------- Mit Datenbank: Sitemap nur mit indexierbaren Seiten, alte Slugs leiten um ----------
// Läuft nur mit TEST_DATABASE_URL (schema.sql, seed_criteria.sql und alle Migrationen). Legt Testobjekte mit Präfix
// „b46-test-“ an und löscht sie am Ende wieder.
const DB_URL = process.env.TEST_DATABASE_URL;

test('Datenbank: Sitemap ohne noindex- und Weiterleitungs-URLs, 301 der alten Slugs', { skip: !DB_URL && 'TEST_DATABASE_URL nicht gesetzt' }, async () => {
  const db = require('../src/db');
  const app = require('../src/server');
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const get = (p) => fetch(`${origin}${p}`, { redirect: 'manual', headers: { host: 'tri-hotel.de' } });
  const ranking = await db.one(`SELECT r.* FROM rankings r JOIN sites s ON s.id = r.site_id WHERE s.primary_domain = 'tri-hotel.de' AND r.is_default`);
  const add = async (slug, country, lat, lng, completeness = 100) => {
    const e = await db.one(`INSERT INTO entities (entity_type, name, slug, city, country, lat, lng) VALUES ($1, $2, $2, 'Test', $3, $4, $5) RETURNING id`,
      [ranking.entity_type, slug, country, lat, lng]);
    await db.query(`INSERT INTO entity_rankings (entity_id, ranking_id, status, score, fact_score, completeness, published_at) VALUES ($1, $2, 'live', 80, 80, $3, now())`,
      [e.id, ranking.id, completeness]);
    return e.id;
  };
  try {
    await db.query(`DELETE FROM entities WHERE slug LIKE 'b46-test-%'`);
    // Gardasee: 2 mit Score → Region indexierbar; Italien: 2 mit Score + 1 unvollständig → Land noch nicht (3 nötig)
    const keep = await add('b46-test-garda-a', 'IT', 45.65, 10.67);
    await add('b46-test-garda-b', 'IT', 45.66, 10.68);
    await add('b46-test-garda-c', 'IT', 45.67, 10.69, 10);
    // Zypern: nur 1 Objekt → Region und Land noindex
    await add('b46-test-zypern', 'CY', 35.0, 33.2);
    await db.query(`INSERT INTO entity_slug_redirects (entity_type, old_slug, entity_id) VALUES ($1, 'b46-test-alt', $2)`, [ranking.entity_type, keep]);

    const robots = async (p) => { const r = await get(p); return { status: r.status, noindex: /name="robots" content="noindex/.test(await r.text()) }; };
    assert.deepEqual(await robots('/region/gardasee'), { status: 200, noindex: false });
    assert.deepEqual(await robots('/land/italien'), { status: 200, noindex: true });
    assert.deepEqual(await robots('/region/zypern'), { status: 200, noindex: true });
    assert.deepEqual(await robots('/land/zypern'), { status: 200, noindex: true });

    const old = await get(`/${ranking.entity_type}/b46-test-alt`);
    assert.equal(old.status, 301);
    assert.equal(old.headers.get('location'), `/${ranking.entity_type}/b46-test-garda-a`);

    const xml = await (await get('/sitemap.xml')).text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
    assert.ok(locs.includes('/region/gardasee'));
    assert.ok(!locs.includes('/land/italien'));
    assert.ok(!locs.includes('/region/zypern'));
    assert.ok(!locs.some((l) => l.endsWith('/b46-test-alt')), 'alte Slugs nicht in der Sitemap');
    // Jede Sitemap-URL: 200, ohne noindex, canonical auf sich selbst
    for (const loc of locs) {
      const r = await get(loc);
      const html = await r.text();
      assert.equal(r.status, 200, `${loc} liefert ${r.status}`);
      assert.doesNotMatch(html, /name="robots" content="noindex/, `${loc} ist noindex`);
      const canon = html.match(/rel="canonical" href="([^"]+)"/);
      if (canon) assert.equal(new URL(canon[1]).pathname, loc, `${loc}: canonical zeigt woanders hin`);
    }
  } finally {
    await db.query(`DELETE FROM entities WHERE slug LIKE 'b46-test-%'`);
    server.close();
    await db.pool.end();
  }
});
