const test = require('node:test');
const assert = require('node:assert/strict');
const budget = require('../src/lib/ta-budget');
const ta = require('../src/services/tripadvisor');

const CFG = {
  enabled: true, apiKey: 'geheim-123', monthlyLimit: 400, dailyLimit: 20, freeUnits: 1000, unitPriceUsd: 0.015, unitsOffset: 0,
  photoCount: 5, searchSize: 3, timeoutMs: 3000, maxHotels: 10, allowlist: true, imageHosts: ['tripadvisor.com', 'tacdn.com'], photoParams: '',
  locationUrl: 'https://www.tripadvisor.de/Hotel_Review-d{id}', photosUrl: 'https://www.tripadvisor.de/Hotel_Review-d{id}#/media',
};

// Speicher im Arbeitsspeicher mit denselben Regeln wie die Datenbank (beide Grenzen prüfen, dann erhöhen)
function memoryStore(start = {}) {
  const units = { ...start };
  const logs = [];
  return {
    units, logs,
    async reserve(keys, n, limits) {
      if ((units[keys.month] || 0) + n > limits.month) return { ok: false, blocked: 'month' };
      if ((units[keys.day] || 0) + n > limits.day) return { ok: false, blocked: 'day' };
      for (const k of [keys.month, keys.day, keys.total]) units[k] = (units[k] || 0) + n;
      return { ok: true };
    },
    async adjust(keys, diff) { for (const k of [keys.month, keys.day, keys.total]) units[k] = Math.max(0, (units[k] || 0) + diff); },
    async log(entry) { logs.push(entry); },
  };
}

const NOW = new Date('2026-11-14T10:00:00Z');
const KEYS = budget.periodKeys(NOW);
const reply = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

function setup({ cfg = {}, start = {}, respond = () => reply(200, { data: [] }) } = {}) {
  const store = memoryStore(start);
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts, reservedAtCall: { ...store.units } });
    return respond(url, opts);
  };
  const guard = budget.createGuard({ cfg: { ...CFG, ...cfg }, store, fetchImpl, now: () => NOW });
  return { guard, store, calls };
}

test('Zeiträume nach Berliner Zeit: Monat, Tag und Lebensdauer', () => {
  assert.deepEqual(budget.periodKeys(new Date('2026-11-14T10:00:00Z')), { month: 'm:2026-11', day: 'd:2026-11-14', total: 'total' });
  // 23:30 UTC am 30.11. ist in Berlin schon der 1.12.
  assert.deepEqual(budget.periodKeys(new Date('2026-11-30T23:30:00Z')), { month: 'm:2026-12', day: 'd:2026-12-01', total: 'total' });
});

test('Einheiten: Fotos 1 je Abruf, Suche je zurückgegebener ID, Fehler und Allowlist kosten nichts', () => {
  assert.equal(budget.billedUnits('photos', 200, { data: [1, 2, 3, 4, 5] }), 1);
  assert.equal(budget.billedUnits('search', 200, { data: [{}, {}] }), 2);
  assert.equal(budget.billedUnits('nearby', 200, { data: [] }), 0);
  assert.equal(budget.billedUnits('search', 200, null), null, 'unlesbare Antwort: unbekannt');
  for (const s of [400, 403, 404, 429, 500]) assert.equal(budget.billedUnits('photos', s, {}), 0);
  assert.equal(budget.billedUnits('allowlist_append', 200, { added: 3 }), 0);
  assert.equal(budget.reservedUnits('photos', CFG), 1);
  assert.equal(budget.reservedUnits('search', CFG), 3);
  assert.equal(budget.reservedUnits('allowlist_delete', CFG), 0);
});

test('Not-Aus: ohne TA_PHOTOS_ENABLED=true geht kein Aufruf raus, auch nicht für Suche oder Allowlist', async () => {
  const { guard, store, calls } = setup({ cfg: { enabled: false } });
  for (const ep of ['photos', 'search', 'nearby', 'allowlist_get', 'allowlist_append']) {
    assert.deepEqual(await guard.call(ep, { url: 'https://terra.tripadvisor.com/api/x' }), { ok: false, reason: 'off' });
  }
  assert.equal(calls.length, 0);
  assert.deepEqual(store.units, {});
});

test('Ohne Schlüssel kein Aufruf', async () => {
  const { guard, calls } = setup({ cfg: { apiKey: null } });
  assert.equal((await guard.call('photos', { url: 'https://x' })).reason, 'no_key');
  assert.equal(calls.length, 0);
});

test('Zähler wird vor dem Abruf erhöht; Fotoabruf kostet eine Einheit', async () => {
  const { guard, store, calls } = setup({ respond: () => reply(200, { data: [{}, {}, {}, {}, {}] }) });
  const r = await guard.call('photos', { url: 'https://terra.tripadvisor.com/api/locations/1/photos', entityId: 'e1' });
  assert.equal(r.ok, true);
  assert.equal(r.units, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].reservedAtCall[KEYS.month], 1, 'beim Abruf schon gezählt');
  assert.deepEqual(store.units, { [KEYS.month]: 1, [KEYS.day]: 1, total: 1 });
  assert.equal(calls[0].opts.headers['X-API-Key'], 'geheim-123');
  assert.deepEqual(store.logs, [{ entityId: 'e1', endpoint: 'photos', units: 1, status: 200, durationMs: store.logs[0].durationMs, outcome: 'ok' }]);
});

test('Suche: reserviert die Höchstzahl, gezählt werden die zurückgegebenen IDs', async () => {
  const two = setup({ respond: () => reply(200, { data: [{ location: { id: 1 } }, { location: { id: 2 } }] }) });
  const r = await two.guard.call('search', { url: 'https://x' });
  assert.equal(two.calls[0].reservedAtCall[KEYS.day], 3);
  assert.equal(r.units, 2);
  assert.deepEqual(two.store.units, { [KEYS.month]: 2, [KEYS.day]: 2, total: 2 });
  const none = setup({ respond: () => reply(200, { data: [] }) });
  assert.equal((await none.guard.call('nearby', { url: 'https://x' })).units, 0);
  assert.deepEqual(none.store.units, { [KEYS.month]: 0, [KEYS.day]: 0, total: 0 });
});

test('Fehlerantworten (4xx/5xx) kosten nichts, es gibt keinen zweiten Versuch', async () => {
  for (const status of [400, 404, 429, 500]) {
    const { guard, store, calls } = setup({ respond: () => reply(status, { title: 'Fehler' }) });
    const r = await guard.call('photos', { url: 'https://x', entityId: 'e1' });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'error');
    assert.equal(r.status, status);
    assert.equal(r.data, null, 'keine Inhalte aus Fehlerantworten');
    assert.equal(calls.length, 1, 'kein Retry');
    assert.deepEqual(store.units, { [KEYS.month]: 0, [KEYS.day]: 0, total: 0 });
    assert.equal(store.logs[0].outcome, 'error');
    assert.equal(store.logs[0].units, 0);
  }
});

test('Zeitüberschreitung: Reservierung bleibt stehen (im Zweifel gezählt), kein zweiter Versuch', async () => {
  const { guard, store, calls } = setup({ respond: () => { const e = new Error('timeout'); e.name = 'TimeoutError'; throw e; } });
  const r = await guard.call('search', { url: 'https://x' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'timeout');
  assert.equal(calls.length, 1);
  assert.equal(store.units[KEYS.month], 3);
  assert.equal(store.logs[0].status, null);
});

test('Monatsgrenze: bei 400 kein Abruf mehr', async () => {
  const { guard, store, calls } = setup({ start: { [KEYS.month]: 400 } });
  const r = await guard.call('photos', { url: 'https://x' });
  assert.deepEqual(r, { ok: false, reason: 'month_limit' });
  assert.equal(calls.length, 0);
  assert.equal(store.units[KEYS.month], 400);
  assert.equal(store.logs[0].outcome, 'month_limit');
});

test('Grenze gilt für die reservierten Einheiten: Suche mit 3 passt bei 398 nicht mehr, ein Foto schon', async () => {
  const a = setup({ start: { [KEYS.month]: 398 } });
  assert.equal((await a.guard.call('search', { url: 'https://x' })).reason, 'month_limit');
  assert.equal(a.calls.length, 0);
  const b = setup({ start: { [KEYS.month]: 398 }, respond: () => reply(200, { data: [{}] }) });
  assert.equal((await b.guard.call('photos', { url: 'https://x' })).ok, true);
});

test('Tagesgrenze: 20 Abrufe gehen durch, der 21. nicht', async () => {
  const { guard, store, calls } = setup({ respond: () => reply(200, { data: [{}] }) });
  for (let i = 0; i < 20; i++) assert.equal((await guard.call('photos', { url: 'https://x' })).ok, true);
  assert.equal((await guard.call('photos', { url: 'https://x' })).reason, 'day_limit');
  assert.equal(calls.length, 20);
  assert.equal(store.units[KEYS.day], 20);
});

test('Allowlist-Aufrufe zählen nicht ins Budget, auch nicht bei erreichter Grenze', async () => {
  const { guard, store, calls } = setup({ start: { [KEYS.month]: 400, [KEYS.day]: 20 }, respond: () => reply(200, { added: 1, deleted: 0, no_change: 0 }) });
  const r = await guard.call('allowlist_append', { url: 'https://x', method: 'POST', body: { operation_type: 'APPEND', allowlist: [5] } });
  assert.equal(r.ok, true);
  assert.equal(r.units, 0);
  assert.equal(store.units[KEYS.month], 400);
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.body, '{"operation_type":"APPEND","allowlist":[5]}');
});

test('Protokoll enthält weder Schlüssel noch Inhalte', async () => {
  const { guard, store } = setup({ respond: () => reply(200, { data: [{ photo: { original_size_url: 'https://media-cdn.tripadvisor.com/a.jpg' }, caption: 'Pool' }] }) });
  await guard.call('photos', { url: 'https://x', entityId: 'e1' });
  const text = JSON.stringify(store.logs);
  assert.ok(!text.includes('geheim-123'));
  assert.ok(!text.includes('tripadvisor.com') && !text.includes('Pool'));
  assert.deepEqual(Object.keys(store.logs[0]).sort(), ['durationMs', 'endpoint', 'entityId', 'outcome', 'status', 'units']);
});

test('Scheitert das Reservieren, gibt es keinen Abruf', async () => {
  const store = memoryStore();
  store.reserve = async () => { throw new Error('Datenbank weg'); };
  let fetched = 0;
  const guard = budget.createGuard({ cfg: CFG, store, fetchImpl: async () => { fetched += 1; return reply(200, {}); }, now: () => NOW });
  await assert.rejects(() => guard.call('photos', { url: 'https://x' }), /Datenbank weg/);
  assert.equal(fetched, 0);
});

test('Kosten: Freikontingent einmalig, danach 0,015 USD je Einheit', () => {
  const est = (total, month) => budget.estimateCostUsd({ total, month, freeUnits: 1000, unitPriceUsd: 0.015 });
  assert.equal(est(300, 100), 0, 'alles im Freikontingent');
  assert.equal(est(1100, 400), 1.5, 'Monat begann bei 700: 300 frei, 100 bezahlt');
  assert.equal(est(1500, 400), 6, 'Freikontingent schon vorher verbraucht: 400 × 0,015');
  assert.equal(est(1000, 400), 0, 'genau aufgebraucht');
});

test('Übersicht: Zähler, Freikontingent mit Offset, Ampel ab 80 %', () => {
  const s = budget.summary({ month: 320, day: 4, total: 700 }, { ...CFG, unitsOffset: 150 });
  assert.equal(s.monthLevel, 'warn');
  assert.equal(s.dayLevel, 'ok');
  assert.equal(s.total, 850);
  assert.equal(s.freeUsed, 850);
  assert.equal(s.freeLevel, 'warn');
  assert.equal(s.costUsd, 0);
  assert.equal(s.maxCostUsd, 6);
  assert.equal(budget.level(400, 400), 'full');
  assert.equal(budget.level(0, 0), 'full', 'Grenze 0 sperrt');
});

test('Zustand je Objekt: ID, Auswahl, eigene Fotos, Not-Aus, Allowlist', () => {
  const e = { ta_location_id: 123, ta_photos_enabled: true, ta_allowlisted_at: new Date() };
  const st = (entity, ownImages = 0, c = CFG) => ta.photoStatus(entity, { ownImages, c });
  assert.equal(st(e), 'active');
  assert.equal(st({ ...e, ta_location_id: null }), 'no_id');
  assert.equal(st({ ...e, ta_photos_enabled: false }), 'disabled');
  assert.equal(st(e, 1), 'own_photos', 'eigene Fotos haben Vorrang');
  assert.equal(st(e, 0, { ...CFG, enabled: false }), 'off');
  assert.equal(st(e, 0, { ...CFG, apiKey: null }), 'off');
  assert.equal(st({ ...e, ta_allowlisted_at: null }), 'allowlist_pending');
  assert.equal(st({ ...e, ta_allowlisted_at: null }, 0, { ...CFG, allowlist: false }), 'active');
});

test('Fotos: höchstens 5, nur https von Tripadvisor-Hosts, nur die Felder für die Anzeige', () => {
  const photo = (n, url) => ({ id: n, location_id: 9, photo: { original_size_url: url, original_width: 1600, original_height: 1200, key: 'k' },
    caption: ` Bild ${n} `, user: { username: `gast${n}`, avatar_url: { url: 'https://x' } }, source: { name: 'Traveler' }, publish_ts: '2026-05-01T10:00:00Z' });
  const body = { data: [
    photo(1, 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/1.jpg'),
    photo(2, 'http://media-cdn.tripadvisor.com/2.jpg'),
    photo(3, 'https://boese.example/3.jpg'),
    photo(4, 'https://tripadvisor.com.boese.example/4.jpg'),
    ...[5, 6, 7, 8, 9, 10].map((n) => photo(n, `https://media-cdn.tripadvisor.com/${n}.jpg`)),
  ] };
  const list = ta.mapPhotos(body, CFG);
  assert.equal(list.length, 5);
  assert.deepEqual(list.map((p) => p.url.split('/').pop()), ['1.jpg', '5.jpg', '6.jpg', '7.jpg', '8.jpg']);
  assert.deepEqual(list[0], { url: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/1.jpg', width: 1600, height: 1200,
    caption: 'Bild 1', username: 'gast1', source: 'Traveler', published: '2026-05-01' });
  assert.deepEqual(ta.mapPhotos(null, CFG), []);
  assert.equal(ta.mapPhotos(body, { ...CFG, photoParams: 'w=1200' })[0].url.endsWith('1.jpg?w=1200'), true);
});

test('Links zur Tripadvisor-Seite aus der Location ID', () => {
  assert.deepEqual(ta.links(188151, CFG), { page: 'https://www.tripadvisor.de/Hotel_Review-d188151', photos: 'https://www.tripadvisor.de/Hotel_Review-d188151#/media' });
});

test('Suchabfrage: wenige Treffer, Kategorie aus dem Objekttyp, Umkreis nur mit Koordinaten', () => {
  const hotel = { entity_type: 'hotel', name: 'Playitas Hotel', city: 'Las Playitas', country: 'es', lat: '28.229', lng: '-13.985' };
  assert.deepEqual(ta.searchParams(hotel, 'name_city', CFG), { version: '1', size: '3', category: 'HOTEL', query: 'Playitas Hotel', search_type: 'NAME', country_code: 'ES', geo_name: 'Las Playitas' });
  assert.equal(ta.searchParams(hotel, 'name', CFG).geo_name, undefined);
  assert.deepEqual(ta.searchParams(hotel, 'nearby', CFG), { version: '1', size: '3', category: 'HOTEL', lat: '28.229', lon: '-13.985', radius: '1', unit: 'KM', sort: 'distance,asc' });
  assert.equal(ta.searchParams({ ...hotel, lat: null }, 'nearby', CFG), null);
  // zweites Ranking mit anderem Objekttyp: keine Hotel-Annahme
  const gym = { entity_type: 'gym', name: 'Hybrid Box', country: 'DE' };
  assert.equal(ta.searchParams(gym, 'name', CFG).category, undefined);
  assert.equal(ta.searchParams({ ...gym, name: ' ' }, 'name', CFG), null);
});

test('Treffer bewerten: eindeutig nur bei nahem Treffer mit bestem Namen', () => {
  const entity = { name: 'Playitas Hotel', lat: 28.2290, lng: -13.9850 };
  const loc = (id, name, lat, lng) => ({ loc: { id, names: [{ language: 'en', primary: true, value: name }], addresses: [{ formatted: 'Calle 1, Las Playitas' }],
    coordinates: { latitude: lat, longitude: lng }, urls: { tripadvisor: { main: `https://www.tripadvisor.com/Hotel_Review-d${id}` } } } });
  const r = ta.rank(entity, [loc(1, 'Playitas Aparthotel', 28.2291, -13.9851), loc(2, 'Playitas Hotel', 28.2292, -13.9849), loc(3, 'Playitas Hotel', 28.30, -13.90)]);
  assert.equal(r.pick.id, 2);
  assert.equal(r.candidates.length, 3);
  assert.ok(r.candidates.find((c) => c.id === 3).distanceM > ta.MAX_DISTANCE_M);
  assert.equal(r.candidates.find((c) => c.id === 2).url, 'https://www.tripadvisor.com/Hotel_Review-d2');
  // zwei gleich gute: kein Vorschlag
  assert.equal(ta.rank(entity, [loc(1, 'Playitas Hotel', 28.2291, -13.9851), loc(2, 'Hotel Playitas', 28.2292, -13.9849)]).pick, null);
  // Umkreissuche liefert die Entfernung mit
  const near = ta.rank({ name: 'Playitas Hotel', lat: null, lng: null }, [{ loc: loc(7, 'Playitas Hotel', 0, 0).loc, km: 0.05 }]);
  assert.equal(near.candidates[0].distanceM, 50);
  assert.equal(near.pick.id, 7);
  // ungültige IDs fallen weg
  assert.deepEqual(ta.rank(entity, [{ loc: { id: 'x', names: [] } }, { loc: null }]).candidates, []);
});

test('Vormerkung einer Suche enthält nur Status, IDs und Zeitpunkt', () => {
  const at = new Date('2026-11-14T10:00:00Z');
  const found = ta.suggestion({ candidates: [{ id: 2, name: 'Geheim', address: 'Straße' }, { id: 1 }], pick: { id: 2 } }, at);
  assert.deepEqual(found, { status: 'found', id: 2, ids: [2, 1], at: '2026-11-14T10:00:00.000Z' });
  assert.equal(ta.suggestion({ candidates: [{ id: 1 }, { id: 2 }], pick: null }, at).status, 'unclear');
  assert.equal(ta.suggestion({ candidates: [], pick: null }, at).status, 'none');
});

test('Allowlist-Abgleich: ausgewählte hinzufügen, abgewählte entfernen, sonst nichts', () => {
  const rows = [
    { id: 'a', ta_location_id: 1, ta_photos_enabled: true, ta_allowlisted_at: null },
    { id: 'b', ta_location_id: 2, ta_photos_enabled: false, ta_allowlisted_at: new Date() },
    { id: 'c', ta_location_id: 3, ta_photos_enabled: true, ta_allowlisted_at: new Date() },
    { id: 'd', ta_location_id: 4, ta_photos_enabled: false, ta_allowlisted_at: null },
    { id: 'e', ta_location_id: null, ta_photos_enabled: true, ta_allowlisted_at: null },
  ];
  const plan = ta.allowlistPlan(rows);
  assert.deepEqual(plan.append.map((r) => r.id), ['a']);
  assert.deepEqual(plan.remove.map((r) => r.id), ['b']);
});

test('Allowlist: OVERWRITE ist nicht möglich', async () => {
  await assert.rejects(() => ta.allowlistChange('OVERWRITE', [1, 2]), /nur APPEND und DELETE/);
});

test('Vorschlag für die Auswahl: beste Scores mit Location ID und ohne eigene Fotos', () => {
  const rows = [
    { id: 'a', name: 'A', score: 90, ta_location_id: 1, own_images: 0 },
    { id: 'b', name: 'B', score: 95, ta_location_id: null, own_images: 0 },
    { id: 'c', name: 'C', score: 88, ta_location_id: 3, own_images: 2 },
    { id: 'd', name: 'D', score: 80, ta_location_id: 4, own_images: 0 },
    { id: 'e', name: 'E', score: 85, ta_location_id: 5, own_images: 0 },
  ];
  assert.deepEqual(ta.suggestTop(rows, 2), ['a', 'e']);
});
