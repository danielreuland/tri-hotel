// Partner-Button in der Rangliste: bester Link je Hotel, Variante nach Datum, Prüfung der /go/-Parameter, Neutralität.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const pb = require('../src/lib/partner-button');
const partners = require('../src/services/partners');

// ---------- bester Link je Hotel ----------
const prog = (code, sort, extra = {}) => ({
  code, name: code.toUpperCase(), sort_order: sort, status: 'active', link_template: `https://net.example/${code}?url={url_enc}&sid={slug}`,
  link_params: {}, direct_link: false, id_from: null, id_url: null, requires_attribute: null, ...extra,
});
const PROGS = [
  prog('expedia', 10, { direct_link: true, id_url: 'https://www.expedia.de/h{id}.Hotel-Information' }),
  prog('check24', 20, { direct_link: true }),
  prog('hotelscom', 30, { direct_link: true, id_from: 'expedia', id_url: 'https://de.hotels.com/h{id}.Hotel-Information' }),
  prog('tripadvisor', 5, { link_template: null }),                       // nicht monetarisiert, trotz Platz 5
  prog('booking', 1, { status: 'inactive' }),                             // inaktiv
  prog('fewo', 2, { requires_attribute: 'vacation_rental' }),             // nur für Ferienwohnungen
];
const E = (id, attributes = {}) => ({ id, slug: `hotel-${id}`, attributes });

test('Bester Link: höchste Priorität unter aktiven, monetarisierten Programmen mit Link', () => {
  const rows = [
    { entity_id: 'a', code: 'check24', url: 'https://www.check24.net/x?c24pp_hotel_id=1' },
    { entity_id: 'a', code: 'expedia', url: 'https://www.expedia.de/h1786689.Hotel-Information' },
    { entity_id: 'a', code: 'tripadvisor', url: 'https://www.tripadvisor.de/x' },
    { entity_id: 'a', code: 'booking', url: 'https://www.booking.com/x' },
    { entity_id: 'b', code: 'check24', url: 'https://www.check24.net/x?c24pp_hotel_id=2' },
    { entity_id: 'c', code: 'tripadvisor', url: 'https://www.tripadvisor.de/y' },
  ];
  const best = partners.pickBest(PROGS, [E('a'), E('b'), E('c')], rows);
  assert.equal(best.get('a').code, 'expedia', 'Expedia vor CHECK24; Tripadvisor (ohne Provision) und Booking (inaktiv) zählen nicht');
  assert.equal(best.get('b').code, 'check24');
  assert.equal(best.has('c'), false, 'nur nicht monetarisierter Link -> kein Button');
});

test('Bester Link: abgeleitete Links (Hotels.com aus der Expedia-Nummer) zählen mit', () => {
  const progs = PROGS.map((p) => (p.code === 'expedia' ? { ...p, status: 'inactive' } : p));
  const rows = [{ entity_id: 'a', code: 'expedia', url: 'https://www.expedia.de/Playitas.h1786689.Hotel-Information' }];
  const best = partners.pickBest(progs, [E('a')], rows);
  assert.equal(best.get('a').code, 'hotelscom');
  assert.equal(best.get('a').url, 'https://de.hotels.com/h1786689.Hotel-Information');
  assert.equal(best.get('a').derived, true);
});

test('Bester Link: kein Link -> kein Button; Merkmal-Programme nur für passende Objekte', () => {
  assert.equal(partners.pickBest(PROGS, [E('x')], []).size, 0);
  const rows = [{ entity_id: 'r', code: 'fewo', url: 'https://www.fewo.example/1' }, { entity_id: 'h', code: 'fewo', url: 'https://www.fewo.example/2' }];
  const best = partners.pickBest(PROGS, [E('r', { vacation_rental: { value: true } }), E('h')], rows);
  assert.equal(best.get('r').code, 'fewo');
  assert.equal(best.has('h'), false);
});

test('Button-Ziel: Direktlink-Programme direkt zum Partner, sonst /go/; gezählt immer per Beacon mit Messparametern', () => {
  const meta = { placement: 'ranking', position: 3, variant: 'B', list: 'mallorca' };
  const direct = partners.buttonLink({ code: 'expedia', name: 'Expedia', url: 'https://www.expedia.de/h1.Hotel-Information', direct_link: true,
    link_template: 'https://net.example/c?url={url_enc}&sid={slug}', link_params: {} }, 'cala-azul', meta);
  assert.equal(direct.href, 'https://net.example/c?url=https%3A%2F%2Fwww.expedia.de%2Fh1.Hotel-Information&sid=cala-azul');
  assert.equal(direct.count, '/go/cala-azul/expedia/klick?src=ranking&pos=3&v=B&liste=mallorca');
  const go = partners.buttonLink({ code: 'holidaycheck', name: 'HolidayCheck', url: 'https://www.holidaycheck.de/x', direct_link: false, link_template: 'https://a.example/?u={url}', link_params: {} }, 'cala-azul', meta);
  assert.equal(go.href, '/go/cala-azul/holidaycheck?src=ranking&pos=3&v=B&liste=mallorca');
});

test('Hotelseite: Links bekommen src=hotelseite an /go/ und am Beacon', () => {
  const g = partners.groupLinks([{ code: 'holidaycheck', name: 'HC', kind: 'booking', url: 'https://www.holidaycheck.de/x', link_template: 'https://a.example/?u={url}', direct_link: false, monetized: true }], 'x', { placement: 'hotelseite' });
  assert.equal(g[0].href.booking, '/go/x/holidaycheck?src=hotelseite');
  assert.equal(g[0].count.booking, '/go/x/holidaycheck/klick?src=hotelseite');
  assert.equal(partners.groupLinks([{ code: 'hc', name: 'HC', kind: 'booking', url: 'https://h.de', direct_link: false }], 'x')[0].href.booking, '/go/x/hc', 'ohne meta wie bisher');
});

// ---------- Variante nach Datum (Europe/Berlin) ----------
test('Variante: gerade Kalendertage A, ungerade B – nach Berliner Zeit', () => {
  assert.equal(pb.variantFor('test', new Date('2026-11-20T12:00:00Z')), 'A');
  assert.equal(pb.variantFor('test', new Date('2026-11-21T12:00:00Z')), 'B');
  // 20.11. 23:30 UTC = 21.11. 00:30 in Berlin (Winterzeit, UTC+1)
  assert.equal(pb.variantFor('test', new Date('2026-11-20T23:30:00Z')), 'B');
  assert.equal(pb.variantFor('test', new Date('2026-11-20T22:59:59Z')), 'A');
  // Sommerzeit (UTC+2): 14.07. 22:30 UTC = 15.07. 00:30 in Berlin
  assert.equal(pb.variantFor('test', new Date('2026-07-14T22:30:00Z')), 'B');
  assert.equal(pb.variantFor('test', new Date('2026-07-14T21:30:00Z')), 'A');
  assert.equal(pb.berlinDay(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
});

test('Variante: Schalter aus = kein Test, immer an = on; Button nur in B und on', () => {
  assert.equal(pb.variantFor('off'), null);
  assert.equal(pb.variantFor(undefined), null);
  assert.equal(pb.variantFor('on'), 'on');
  assert.deepEqual(['A', 'B', 'on', null].map(pb.showsButton), [false, true, true, false]);
  assert.equal(pb.variantOfDay('2026-11-21'), 'B');
  assert.equal(pb.variantOfDay('2026-11-22'), 'A');
});

// ---------- Prüfung der /go/-Parameter ----------
test('/go/-Parameter: nur Whitelist und Zahlenbereich, sonst leer', () => {
  assert.deepEqual(pb.parseMeta({ src: 'ranking', pos: '3', v: 'B', liste: 'mallorca' }), { placement: 'ranking', position: 3, variant: 'B', list: 'mallorca' });
  assert.deepEqual(pb.parseMeta({ src: 'newsletter', pos: '0', v: 'C', liste: 'Mallorca<script>' }), { placement: '', position: 0, variant: '', list: '' });
  assert.equal(pb.parseMeta({ pos: '501' }).position, 0);
  assert.equal(pb.parseMeta({ pos: '500' }).position, 500);
  assert.equal(pb.parseMeta({ pos: '-1' }).position, 0);
  assert.equal(pb.parseMeta({ pos: '3.5' }).position, 0);
  assert.equal(pb.parseMeta({ pos: '1e2' }).position, 0);
  assert.equal(pb.parseMeta({ v: 'on' }).variant, 'on');
  assert.equal(pb.parseMeta({ src: ['ranking', 'region'] }).placement, 'ranking', 'doppelte Parameter: erster zählt');
  assert.equal(pb.parseMeta({ liste: 'a'.repeat(61) }).list, '');
  assert.equal(pb.parseMeta({ liste: '-x' }).list, '');
  assert.deepEqual(pb.parseMeta(), { placement: '', position: 0, variant: '', list: '' });
});

test('/go/-Parameter: Liste muss es geben (gesamt, Region der Site, land-<slug>)', async () => {
  const opts = { regionExists: async (s) => s === 'mallorca', countryExists: (s) => s === 'spanien' };
  assert.equal(await pb.validList('gesamt', opts), 'gesamt');
  assert.equal(await pb.validList('mallorca', opts), 'mallorca');
  assert.equal(await pb.validList('erfunden', opts), '');
  assert.equal(await pb.validList('land-spanien', opts), 'land-spanien');
  assert.equal(await pb.validList('land-atlantis', opts), '');
  assert.equal(await pb.validList('', opts), '');
});

test('Messparameter als Query-String und Rangplatz-Gruppen', () => {
  assert.equal(pb.metaQuery({ placement: 'region', position: 12, variant: 'A', list: 'land-spanien' }), '?src=region&pos=12&v=A&liste=land-spanien');
  assert.equal(pb.metaQuery({}), '');
  assert.deepEqual([1, 3, 4, 10, 11, 0].map(pb.positionBucket), ['1–3', '1–3', '4–10', '4–10', '11+', 'unbekannt']);
});

// ---------- Neutralität: Sortierung und Score lesen keine Partnerdaten ----------
const PARTNER_TABLES = /entity_links|partner_programs|outbound_clicks|ranking_list_stats|partner_button|partner_slots/;

test('Neutralität: Score-Berechnung (scoring.js) kennt keine Partnerdaten', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/services/scoring.js'), 'utf8');
  assert.doesNotMatch(src, PARTNER_TABLES);
  assert.doesNotMatch(src, /require\(['"]\.\/partners['"]\)|partner-button/);
});

test('Neutralität: Reihenfolge der Rangliste gleich, ob ein Hotel Partnerlinks hat oder nicht', async () => {
  // Datenbank ersetzen: listLive bekommt Hotels; Partnerlinks gäbe es für das schlechteste Hotel. Jede Abfrage wird mitgeschrieben.
  const dbPath = require.resolve('../src/db');
  const saved = require.cache[dbPath];
  const queries = [];
  const hotels = [
    { id: 'h1', name: 'Alpha', score: 80, completeness: 0.9, ko_reason: null, is_provisional: false, attributes: {} },
    { id: 'h2', name: 'Beta', score: 90, completeness: 0.9, ko_reason: null, is_provisional: false, attributes: {} },
    { id: 'h3', name: 'Gamma', score: 70, completeness: 0.9, ko_reason: null, is_provisional: false, attributes: {} },
    { id: 'h4', name: 'Aaron', score: 80, completeness: 0.9, ko_reason: null, is_provisional: false, attributes: {} },
  ];
  const fake = (withLinks) => ({
    many: async (sql) => {
      queries.push(sql);
      if (/FROM entity_rankings er JOIN entities e/.test(sql)) return hotels.map((h) => ({ ...h }));
      if (/entity_links/.test(sql)) return withLinks ? [{ entity_id: 'h3', code: 'expedia', url: 'https://www.expedia.de/h1.Hotel-Information' }] : [];
      return [];
    },
    one: async (sql) => { queries.push(sql); return null; },
    query: async (sql) => { queries.push(sql); return { rows: [] }; },
  });
  const load = (withLinks) => {
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fake(withLinks) };
    delete require.cache[require.resolve('../src/services/rankings')];
    return require('../src/services/rankings');
  };
  const ranking = { id: 'r1', formula: { min_completeness: 0.7 }, labels: [] };
  try {
    const order = async (withLinks) => (await load(withLinks).listLive(ranking)).ranked.map((e) => e.id);
    const without = await order(false);
    const withL = await order(true);
    assert.deepEqual(without, ['h2', 'h4', 'h1', 'h3'], 'nach Score, bei Gleichstand nach Name');
    assert.deepEqual(withL, without);
    assert.ok(queries.length > 0);
    for (const q of queries) assert.doesNotMatch(q, PARTNER_TABLES, `listLive liest Partnerdaten: ${q.slice(0, 80)}`);
    // Der Button wird erst nach dem Sortieren bestimmt und ändert die Liste nicht
    const list = (await load(true).listLive(ranking)).ranked;
    const before = list.map((e) => e.id);
    partners.pickBest(PROGS, list, [{ entity_id: 'h3', code: 'expedia', url: 'https://www.expedia.de/h1.Hotel-Information' }]);
    assert.deepEqual(list.map((e) => e.id), before);
  } finally {
    if (saved) require.cache[dbPath] = saved; else delete require.cache[dbPath];
    delete require.cache[require.resolve('../src/services/rankings')];
  }
});

test('Neutralität: Alle Buttons sind gleich – Text und Gestaltung hängen nicht vom Anbieter ab', () => {
  const view = fs.readFileSync(path.join(__dirname, '../src/views/partials/rank-row.ejs'), 'utf8');
  const btn = view.slice(view.indexOf('<a class="partner-btn"'), view.indexOf('</a>', view.indexOf('<a class="partner-btn"')));
  // Anbietername nur im Analyse-Attribut, nicht im sichtbaren Text, nicht in Klassen
  assert.doesNotMatch(btn.replace(/data-goal-prop-anbieter="<%= btn\.program %>"/, ''), /btn\.program|btn\.code|logo/);
  assert.match(view, /rel="sponsored nofollow noopener"/);
  assert.match(view, /target="_blank"/);
});
