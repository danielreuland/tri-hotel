const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const api = require('../src/services/internal-api');
const { createRouter, logPath } = require('../src/routes/internal');
const auth = require('../src/lib/internal-auth');
const { shapeErrors } = require('./helpers/shape');

const fx = (name) => require(`../docs/internal-api/fixtures/${name}`);
const E = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const C = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

// Zeilen, wie sie die Abfragen in services/internal-api.js liefern
const rankingRow = { code: 'triathlon-hotel', name: 'TriScore Triathlon-Hotels', rankingSlug: 'triathlon-hotels', isDefault: true, entityType: 'hotel',
  siteId: 's1', domain: 'tri-hotel.de', status: 'live', score: 90, provisional: true, completeness: '86.00' };
const entityRow = {
  id: E, name: 'Club La Santa', city: 'Tinajo', country: 'ES', entity_type: 'hotel', website: 'https://www.clublasanta.com', slug: 'club-la-santa-tinajo',
  lat: '29.063600', lng: '-13.687800', attributes: { address: { street: 'Av. Krönner 25', postal_code: '35560', city: 'Tinajo' } },
  updated_at: new Date('2026-11-02T08:00:00Z'), contact_email: 'info@clublasanta.com', contact_email_source: 'website', contact_email_evidence: 'https://x/kontakt',
  rankings: [rankingRow, { ...rankingRow, code: 'fitness-racing-hotel', rankingSlug: 'fitness-racing-hotels', isDefault: false, status: 'draft', score: null, completeness: null }],
};
const campRow = {
  id: C, name: 'Club La Santa Sports', slug: 'club-la-santa', status: 'active', seat: 'Tinajo', website: 'https://www.clublasanta.com', model: 'resort',
  regions: ['Kanaren'], updated_at: new Date('2026-10-28T10:00:00Z'), lead_active: false, contact_email: 'sports@x.com', contact_phone: '+34 928 599 999',
  contact_source: 'website', contact_evidence: null, domain: 'tri-hotel.de',
};
const programRow = { code: 'check24', name: 'CHECK24', status: 'active', link_template: null, link_params: { a: '1' }, direct_link: false,
  live: 53, links: 30, derived: 0, absent: 5, clicks7: 1, clicks30: 6 };

test('Abbildung: Objekt (Kurzform, Detail) entspricht dem Vertrag', () => {
  const s = api.entitySummary(entityRow);
  assert.deepEqual(shapeErrors(s, fx('entities-search.json').items[0]), []);
  assert.equal(s.rankings[0].completeness, 0.86);
  assert.match(s.rankings[0].url, /\/hotel\/club-la-santa-tinajo$/);
  assert.equal(s.rankings[1].url, null, 'URL nur bei live');
  assert.equal(s.updatedAt, '2026-11-02T08:00:00.000Z');
  const d = api.entityDetail(entityRow, { slug: 'lanzarote', name: 'Lanzarote', domain: 'tri-hotel.de' });
  assert.deepEqual(shapeErrors(d, fx('entity.json')), []);
  assert.deepEqual(shapeErrors({ items: [s] }, fx('entities-search.json')), []);
  assert.equal(d.address.text, 'Av. Krönner 25, 35560 Tinajo, Spanien');
  assert.deepEqual(d.contact, { email: 'info@clublasanta.com', phone: null, source: 'website', evidence: 'https://x/kontakt' });
  // ohne Grunddaten: nur Ort/Land, ohne Kontakt: null
  const bare = api.entityDetail({ ...entityRow, attributes: {}, contact_email: null, country: null }, null);
  assert.deepEqual(bare.address, { street: null, postalCode: null, city: 'Tinajo', country: null, text: 'Tinajo' });
  assert.equal(bare.contact, null);
  assert.equal(bare.region, null);
  // weiteres Ranking: eigener Pfad
  assert.equal(api.entityPath({ isDefault: false, rankingSlug: 'fitness-racing-hotels' }, 'x'), '/rankings/fitness-racing-hotels/x');
});

test('Abbildung: keine Personendaten in Objekt- und Camp-Antworten', () => {
  const d = api.entityDetail({ ...entityRow, reply_name: 'Ana', recipient: 'ana@x.com' }, null);
  assert.ok(!JSON.stringify(d).includes('Ana'));
  const c = api.campDetail({ ...campRow, lead_email: 'chef@x.com', lead_fee: 25 });
  assert.ok(!JSON.stringify(c).includes('chef@x.com'));
  assert.ok(!('leadFee' in c));
});

test('Abbildung: Camp-Anbieter, Partnerprogramme, Besuche', () => {
  const s = api.campSummary(campRow);
  assert.deepEqual(shapeErrors({ items: [s] }, fx('camp-providers-search.json')), []);
  assert.match(s.url, /\/trainingscamp\/anbieter\/club-la-santa$/);
  assert.equal(api.campSummary({ ...campRow, status: 'draft' }).url, null);
  assert.deepEqual(shapeErrors(api.campDetail(campRow), fx('camp-provider.json')), []);
  const p = api.programOut(programRow);
  assert.deepEqual(shapeErrors({ items: [p], generatedAt: 'x' }, fx('partner-programs.json')), []);
  assert.deepEqual(p.coverage, { live: 53, links: 30, derived: 0, absent: 5, missing: 18, share: 57 });
  assert.equal(p.monetized, true);
  assert.equal(api.programOut({ ...programRow, link_params: {} }).monetized, false);
  assert.equal(api.coverage({ live: 0, links: 0, derived: 0, absent: 0 }).share, 0);
  assert.deepEqual(api.visitsOut({ week: { visitors: 208 }, month: { visitors: 328 } }), { d7: 208, d30: 328 });
  assert.equal(api.visitsOut(null), null);
  assert.equal(api.visitsOut({ error: true }), null);
});

test('Abbildung: stats je Site, Summen ohne Site-Bezug', () => {
  const rows = [
    { code: 'tri-hotel', name: 'tri-hotel.de', domain: 'tri-hotel.de', status: 'active', live: 53, review: 3, camps_active: 22, requests7: 1, requests30: 4 },
    { code: 'fitnessracing-hotel', name: 'fitnessracing-hotel.de', domain: 'fitnessracing-hotel.de', status: 'draft', live: 0, review: 0, camps_active: 0, requests7: 0, requests30: 0 },
  ];
  const totals = { tasks_open: 155, partner7: 4, partner30: 17, camp7: 2, camp30: 9 };
  const s = api.statsOut(rows, totals, [{ week: { visitors: 208 }, month: { visitors: 328 } }, null], new Date('2026-11-02T12:00:00Z'));
  assert.deepEqual(s, fx('stats.json'));
});

test('Zeitraum und Seitensummen', () => {
  assert.deepEqual(api.period(30, new Date('2026-11-02T15:00:00Z')), { from: '2026-10-04', to: '2026-11-02' });
  assert.deepEqual(api.period(1, new Date('2026-11-02T00:00:00Z')), { from: '2026-11-02', to: '2026-11-02' });
  assert.deepEqual(api.sumPages([{ pageviews: 3, visitors: 2 }, { pageviews: 4, visitors: 1 }]), { pageviews: 7, visitors: 3 });
  assert.deepEqual(api.sumPages([{ pageviews: 3, visitors: 2 }, { pageviews: null, visitors: null }]), { pageviews: null, visitors: null });
  assert.deepEqual(api.sumPages([]), { pageviews: 0, visitors: 0 });
});

test('Protokollpfad ohne Query-Werte', () => {
  assert.equal(logPath('/internal/v1/entities?q=Ana%20Beispiel&limit=5'), '/internal/v1/entities?q=&limit=');
  assert.equal(logPath('/internal/v1/stats'), '/internal/v1/stats');
});

// --- Router über HTTP -------------------------------------------------------------------------------------------

const SECRET = 'k'.repeat(40);
const stub = {
  UUID_RE: api.UUID_RE,
  searchEntities: async (q, limit) => (q === 'leer' ? [] : [api.entitySummary(entityRow)].slice(0, limit)),
  entitiesByIds: async (ids) => (ids.includes(E) ? [api.entitySummary(entityRow)] : []),
  listEntities: async (o) => ({ items: [api.entityDetail(entityRow, null)], total: 53, limit: o.limit, offset: o.offset, seen: o }),
  listCampProviders: async (o) => ({ items: [api.campDetail(campRow)], total: 22, limit: o.limit, offset: o.offset }),
  entity: async (id) => (id === E ? api.entityDetail(entityRow, { slug: 'lanzarote', name: 'Lanzarote', domain: 'tri-hotel.de' }) : null),
  entityMetrics: async (id, days) => (id === E ? { ...fx('entity-metrics.json'), days } : null),
  searchCampProviders: async () => [api.campSummary(campRow)],
  campProvidersByIds: async () => [api.campSummary(campRow)],
  campProvider: async (id) => (id === C ? api.campDetail(campRow) : null),
  campProviderMetrics: async (id, days) => (id === C ? { ...fx('camp-provider-metrics.json'), days } : null),
  partnerPrograms: async () => ({ items: [api.programOut(programRow)], generatedAt: new Date().toISOString() }),
  stats: async () => { throw new Error('kaputt'); },
};

async function withServer(opts, fn) {
  const calls = [];
  const app = express();
  app.use('/internal', createRouter({ service: stub, keys: auth.parseKeys(`hub:${SECRET}`), log: (e) => calls.push(e), ...opts }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { sign = true, secret = SECRET, headers = {}, method = 'GET', now = Date.now() } = {}) => {
    const h = sign ? auth.headers({ app: 'hub', secret, method, path, now }) : {};
    const res = await fetch(base + path, { method, headers: { ...h, ...headers } });
    return { status: res.status, headers: res.headers, body: await res.json() };
  };
  try {
    await fn(call, calls);
  } finally {
    server.close();
  }
}

test('Router: signierte Aufrufe liefern die Vertragsform, Header no-store/noindex', async () => {
  await withServer({}, async (call, calls) => {
    const r = await call('/internal/v1/entities?q=club&limit=5');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('x-robots-tag'), 'noindex');
    assert.equal(r.headers.get('set-cookie'), null);
    assert.deepEqual(shapeErrors(r.body, fx('entities-search.json')), []);
    assert.deepEqual(shapeErrors((await call(`/internal/v1/entities?ids=${E},${C}`)).body, fx('entities-search.json')), []);
    assert.deepEqual(shapeErrors((await call(`/internal/v1/entities/${E}`)).body, fx('entity.json')), []);
    assert.deepEqual(shapeErrors((await call(`/internal/v1/entities/${E.toUpperCase()}`)).body, fx('entity.json')), [], 'UUID ohne Rücksicht auf Groß-/Kleinschreibung');
    const m = await call(`/internal/v1/entities/${E}/metrics?days=7`);
    assert.equal(m.body.days, 7);
    assert.deepEqual(shapeErrors(m.body, fx('entity-metrics.json')), []);
    assert.deepEqual(shapeErrors((await call('/internal/v1/camp-providers?q=santa')).body, fx('camp-providers-search.json')), []);
    assert.deepEqual(shapeErrors((await call(`/internal/v1/camp-providers?ids=${C}`)).body, fx('camp-providers-search.json')), []);
    assert.deepEqual(shapeErrors((await call(`/internal/v1/camp-providers/${C}`)).body, fx('camp-provider.json')), []);
    assert.deepEqual(shapeErrors((await call(`/internal/v1/camp-providers/${C}/metrics`)).body, fx('camp-provider-metrics.json')), []);
    assert.deepEqual(shapeErrors((await call('/internal/v1/partner-programs')).body, fx('partner-programs.json')), []);
    // Sammelabruf nach Status, seitenweise, in Detailform
    const list = await call('/internal/v1/entities?status=live&ranking=triathlon-hotel&limit=100&offset=100');
    assert.deepEqual(list.body.seen, { status: 'live', ranking: 'triathlon-hotel', limit: 100, offset: 100 });
    delete list.body.seen;
    assert.deepEqual(shapeErrors(list.body, fx('entities-list.json')), []);
    assert.deepEqual((await call('/internal/v1/entities?status=live')).body.seen, { status: 'live', ranking: null, limit: 50, offset: 0 });
    assert.deepEqual(shapeErrors((await call('/internal/v1/camp-providers?status=active&offset=50')).body, fx('camp-providers-list.json')), []);
    // Protokoll: App, Pfad ohne Query-Werte, Status
    assert.deepEqual({ ...calls[0], durationMs: 0 }, { app: 'hub', method: 'GET', path: '/internal/v1/entities?q=&limit=', status: 200, durationMs: 0, reason: null });
  });
});

test('Router: Fehler als JSON (400, 404, 405, 500) in Vertragsform', async () => {
  await withServer({}, async (call) => {
    const bad = async (path, status, error) => {
      const r = await call(path);
      assert.equal(r.status, status, path);
      assert.equal(r.body.error, error, path);
      assert.deepEqual(shapeErrors(r.body, fx('error.json')), []);
    };
    await bad('/internal/v1/entities?q=a', 400, 'bad_request');
    await bad('/internal/v1/entities', 400, 'bad_request');
    await bad('/internal/v1/entities?q=club&limit=51', 400, 'bad_request');
    await bad('/internal/v1/entities?q=club&limit=0', 400, 'bad_request');
    await bad(`/internal/v1/entities?q=club&ids=${E}`, 400, 'bad_request');
    await bad('/internal/v1/entities?ids=keine-uuid', 400, 'bad_request');
    await bad(`/internal/v1/entities?ids=${Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`).join(',')}`, 400, 'bad_request');
    await bad(`/internal/v1/entities/${E}/metrics?days=366`, 400, 'bad_request');
    await bad('/internal/v1/entities?status=online', 400, 'bad_request');
    await bad('/internal/v1/entities?status=live&q=club', 400, 'bad_request');
    await bad('/internal/v1/entities?status=live&limit=101', 400, 'bad_request');
    await bad('/internal/v1/entities?status=live&offset=-1', 400, 'bad_request');
    await bad('/internal/v1/entities?status=live&ranking=Tri%20Hotel', 400, 'bad_request');
    await bad('/internal/v1/camp-providers?status=live', 400, 'bad_request');
    await bad('/internal/v1/camp-providers?status=active&ranking=x', 400, 'bad_request');
    await bad('/internal/v1/entities/keine-uuid', 404, 'not_found');
    await bad('/internal/v1/entities/00000000-0000-4000-8000-000000000000', 404, 'not_found');
    await bad('/internal/v1/camp-providers/00000000-0000-4000-8000-000000000000/metrics', 404, 'not_found');
    await bad('/internal/v1/gibtsnicht', 404, 'not_found');
    await bad('/internal/v1/stats', 500, 'internal');
    const post = await call('/internal/v1/stats', { method: 'POST' });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('allow'), 'GET');
  });
});

test('Router: ohne/mit falscher Signatur 401, abgelaufen 401', async () => {
  await withServer({}, async (call, calls) => {
    assert.equal((await call('/internal/v1/partner-programs', { sign: false })).status, 401);
    assert.equal((await call('/internal/v1/partner-programs', { secret: 'x'.repeat(40) })).status, 401);
    assert.equal((await call('/internal/v1/partner-programs', { now: Date.now() - 301 * 1000 })).status, 401);
    const r = await call('/internal/v1/partner-programs', { sign: false });
    assert.deepEqual(r.body, { error: 'unauthorized', message: 'Signatur ungültig oder abgelaufen.' });
    assert.deepEqual(calls.map((c) => c.reason), ['missing_headers', 'bad_signature', 'expired', 'missing_headers']);
  });
});

test('Router: nur Loopback und ohne Proxy-Header, sonst 404 ohne Hinweis', async () => {
  await withServer({}, async (call) => {
    for (const h of ['X-Forwarded-For', 'X-Real-IP', 'Forwarded']) {
      const r = await call('/internal/v1/partner-programs', { headers: { [h]: '203.0.113.9' } });
      assert.equal(r.status, 404, h);
      assert.equal(r.body.error, 'not_found');
    }
  });
  await withServer({ remoteAddress: () => '203.0.113.9' }, async (call, calls) => {
    assert.equal((await call('/internal/v1/partner-programs')).status, 404);
    assert.equal(calls[0].reason, 'not_loopback');
  });
  await withServer({ remoteAddress: () => '::ffff:127.0.0.1' }, async (call) => {
    assert.equal((await call('/internal/v1/partner-programs')).status, 200);
  });
});

test('Router: Rate-Limit je App mit Retry-After', async () => {
  await withServer({ rateLimit: 3 }, async (call) => {
    for (let i = 0; i < 3; i += 1) assert.equal((await call('/internal/v1/partner-programs')).status, 200);
    const r = await call('/internal/v1/partner-programs');
    assert.equal(r.status, 429);
    assert.equal(r.body.error, 'rate_limited');
    assert.ok(Number(r.headers.get('retry-after')) >= 1);
  });
});
