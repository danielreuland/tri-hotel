const test = require('node:test');
const assert = require('node:assert/strict');
const funnel = require('../src/services/funnel');

const now = new Date('2026-11-15T10:00:00Z');

test('periodRange: gestern, 7 und 30 Tage (einschließlich heute), dieser Monat mit Hochrechnung', () => {
  assert.deepEqual(funnel.periodRange('gestern', now), { key: 'gestern', label: 'gestern', from: '2026-11-14', to: '2026-11-14', days: 1, goalFactor: 1 / 30 });
  const w = funnel.periodRange('7', now);
  assert.deepEqual([w.from, w.to, w.days], ['2026-11-09', '2026-11-15', 7]);
  const m = funnel.periodRange('30', now);
  assert.deepEqual([m.from, m.to, m.days, m.goalFactor], ['2026-10-17', '2026-11-15', 30, 1]);
  const mo = funnel.periodRange('monat', now);
  assert.deepEqual([mo.from, mo.to, mo.days, mo.projectTo, mo.goalFactor], ['2026-11-01', '2026-11-15', 15, 30, 1]);
  assert.equal(funnel.periodRange('unsinn', now).key, '30');
});

test('rows: absolute Zahlen, Anteil an Vorstufe und an allen Aufrufen, Ziel anteilig', () => {
  const values = { pageviews: 1000, entity_views: 400, partner_clicks: 20, camp_views: 100, camp_requests: 2 };
  const r = Object.fromEntries(funnel.rows(values, { pageviews: 2000 }, funnel.periodRange('7', now)).map((x) => [x.key, x]));
  assert.equal(r.pageviews.goal, 467, '2000 × 7 / 30');
  assert.equal(r.pageviews.goalPct, 214.1);
  assert.equal(r.entity_views.ofParent, 40);
  assert.equal(r.partner_clicks.ofParent, 5, 'Klicks von Objektseiten');
  assert.equal(r.partner_clicks.ofTop, 2);
  assert.equal(r.camp_requests.ofParent, 2, 'Anfragen von Camp-Seiten');
  assert.equal(r.camp_views.goal, null);
  assert.equal(r.camp_views.goalPct, null);
});

test('rows: Hochrechnung im laufenden Monat zählt für die Zielerreichung; ohne Plausible bleiben Anteile leer', () => {
  const m = funnel.rows({ pageviews: 900, entity_views: null, partner_clicks: 6, camp_views: null, camp_requests: 0 }, { pageviews: 2000 }, funnel.periodRange('monat', now));
  const pv = m.find((x) => x.key === 'pageviews');
  assert.equal(pv.projection, 1800, '900 in 15 Tagen → 1.800 in 30');
  assert.equal(pv.goalPct, 90);
  const clicks = m.find((x) => x.key === 'partner_clicks');
  assert.equal(clicks.ofParent, null, 'Objektseiten unbekannt');
  assert.equal(clicks.ofTop, 0.7);
});

const DOMAINS = [{ domain: 'tri-hotel.de' }, { domain: 'fitnessracing-hotel.de' }];

test('clickDomain: Herkunft der Partner-Klicks einer Seite zuordnen, Unbekanntes zur ersten Seite', () => {
  assert.equal(funnel.clickDomain('fitnessracing-hotel.de', DOMAINS), 'fitnessracing-hotel.de');
  assert.equal(funnel.clickDomain('www.fitnessracing-hotel.de', DOMAINS), 'fitnessracing-hotel.de');
  assert.equal(funnel.clickDomain('tri-hotel.de', DOMAINS), 'tri-hotel.de');
  assert.equal(funnel.clickDomain('', DOMAINS), 'tri-hotel.de', 'vor der Herkunftserfassung');
  assert.equal(funnel.clickDomain('direkt', DOMAINS), 'tri-hotel.de');
  assert.equal(funnel.clickDomain('google.com', DOMAINS), 'tri-hotel.de');
});

test('scopeOf: Domain aus der Liste, „alle“ nur bei mehreren Seiten, sonst erste Seite', () => {
  assert.equal(funnel.scopeOf('fitnessracing-hotel.de', DOMAINS), 'fitnessracing-hotel.de');
  assert.equal(funnel.scopeOf('alle', DOMAINS), 'alle');
  assert.equal(funnel.scopeOf(undefined, DOMAINS), 'tri-hotel.de');
  assert.equal(funnel.scopeOf('boese.de', DOMAINS), 'tri-hotel.de');
  assert.equal(funnel.scopeOf('alle', [{ domain: 'tri-hotel.de' }]), 'tri-hotel.de');
});

test('sum: mehrere Seiten addieren, unbekannt nur wenn keine Seite einen Wert hat', () => {
  assert.equal(funnel.sum([363, 40]), 403);
  assert.equal(funnel.sum([363, null]), 363);
  assert.equal(funnel.sum([null, undefined]), null);
  assert.equal(funnel.sum([0]), 0);
});

// B-16: Plausible-Abfragen nach Konfiguration je Domain (funnel_domains.plausible), nichts Site-Spezifisches im Code
const TRI = {
  domain: 'eins.de', site_id: 'u1',
  plausible: { pages: { entity_views: 'event:page==/gym/**', camp_views: 'event:page==/camp/**' }, goals: { inquiry_starts: 'Anfrage-Start', compare_views: 'Vergleich' } },
};
const STATIC = { domain: 'zwei.de', site_id: null, plausible: { pages_on: 'eins.de', pages: { entity_views: 'event:page==/gym/**' }, goals: { inquiry_starts: 'Anfrage-Start' } } };
const RANKING = { entity_type: 'objekt' };

test('queries: Filter und Ziele aus der Konfiguration, eigene Site', () => {
  const q = funnel.queries(TRI, [TRI, STATIC], new Set(['eins.de']), RANKING);
  assert.equal(q.site, 'eins.de');
  assert.equal(q.groupSite, 'eins.de');
  assert.deepEqual(q.pages, { entity_views: 'event:page==/gym/**', camp_views: 'event:page==/camp/**' });
  assert.deepEqual(q.goals, { inquiry_starts: 'event:goal==Anfrage-Start', compare_views: 'event:goal==Vergleich' });
});

test('queries: statische Seite zählt auf der Zieldomain mit Besuchen von sich, in „alle zusammen“ nicht doppelt', () => {
  const alone = funnel.queries(STATIC, [TRI, STATIC], new Set(['zwei.de']), RANKING);
  assert.equal(alone.site, 'zwei.de', 'Seitenaufrufe auf der eigenen Plausible-Site');
  assert.equal(alone.groupSite, 'eins.de');
  assert.equal(alone.pages.entity_views, 'event:page==/gym/**;visit:source==zwei.de');
  assert.equal(alone.goals.inquiry_starts, 'event:goal==Anfrage-Start;visit:source==zwei.de');
  assert.equal(alone.pages.camp_views, undefined, 'ohne Filter keine Stufe');
  const both = funnel.queries(STATIC, [TRI, STATIC], new Set(['eins.de', 'zwei.de']), RANKING);
  assert.equal(both.skipped, true);
  assert.deepEqual([both.pages, both.goals], [{}, {}]);
});

test('queries: abweichende Plausible-Site, Rückfall auf Objekttyp des Rankings nur für Domains der App', () => {
  const q = funnel.queries({ domain: 'drei.de', site_id: 'u3', plausible: { site: 'drei-stats.de' } }, [], new Set(), RANKING);
  assert.equal(q.site, 'drei-stats.de');
  assert.equal(q.pages.entity_views, 'event:page==/objekt/**|/rankings/*/*');
  assert.deepEqual(q.goals, {});
  const s = funnel.queries({ domain: 'vier.de', site_id: null, plausible: {} }, [], new Set(), RANKING);
  assert.deepEqual(s.pages, {});
});

test('plausibleValues: Summe je Stufe, unbekannt ohne Konfiguration, Fehlerstatus', () => {
  const per = [funnel.queries(TRI, [TRI, STATIC], new Set(['eins.de', 'zwei.de']), RANKING), funnel.queries(STATIC, [TRI, STATIC], new Set(['eins.de', 'zwei.de']), RANKING)];
  const { values, status } = funnel.plausibleValues(per, {
    totals: [{ total: 1000, groups: { entity_views: 300, camp_views: 50 } }, { total: 40, groups: {} }],
    pages: [{ total: 1000, groups: { entity_views: 300, camp_views: 50 } }, null],
    goals: [{ total: null, groups: { inquiry_starts: 4, compare_views: 7 } }, null],
  });
  assert.deepEqual(values, { pageviews: 1040, entity_views: 300, camp_views: 50, inquiry_starts: 4, compare_views: 7 });
  assert.equal(status, 'ok');
  const off = funnel.plausibleValues([funnel.queries(STATIC, [TRI, STATIC], new Set(['zwei.de']), RANKING)], { totals: [null], pages: [null], goals: [{ error: true }] });
  assert.deepEqual([off.values.inquiry_starts, off.values.compare_views, off.status], [null, null, 'error']);
});

test('Stufen: neue Ereignis-Stufen hängen an Objektseiten bzw. allen Aufrufen', () => {
  const by = Object.fromEntries(funnel.STAGES.map((s) => [s.key, s]));
  assert.equal(by.inquiry_starts.parent, 'entity_views');
  assert.equal(by.compare_views.parent, 'pageviews');
  assert.deepEqual(funnel.GOAL_STAGES, ['inquiry_starts', 'compare_views']);
  assert.deepEqual(funnel.PAGE_STAGES, ['entity_views', 'camp_views']);
});

// Die Zielnamen der Migration müssen genau so in den Vorlagen gesendet werden (sonst zählt der Funnel 0)
test('Vorlagen senden die Ziele, die Migration 126 für den Funnel einträgt', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const sql = fs.readFileSync(path.join(__dirname, '../db/migrations/126_funnel_plausible_config.sql'), 'utf8');
  const entity = fs.readFileSync(path.join(__dirname, '../src/views/public/entity.ejs'), 'utf8');
  const compare = fs.readFileSync(path.join(__dirname, '../src/views/public/compare.ejs'), 'utf8');
  const names = [...sql.matchAll(/'(inquiry_starts|compare_views)', '([^']+)'/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(names, [['inquiry_starts', 'Hotel-Anfrage-Start'], ['compare_views', 'Hotelvergleich']]);
  assert.match(entity, /data-goal="Hotel-Anfrage-Start" data-goal-prop-quelle="hotelseite"/);
  assert.match(entity, /data-goal="Hotel-Anfrage-Start" data-goal-prop-quelle="leiste"/);
  assert.match(compare, /<h1 data-goal="Hotelvergleich" data-goal-prop-anzahl=/);
});

// Eigenschaften (Custom Properties) einheitlich: klein, ohne Umlaute – genau so müssen sie in Plausible angelegt werden
test('Vorlagen: Plausible-Eigenschaften nur aus der bekannten Liste', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.ejs') ? [path.join(dir, e.name)] : []));
  const props = new Set();
  for (const f of walk(path.join(__dirname, '../src/views'))) for (const m of fs.readFileSync(f, 'utf8').matchAll(/data-goal-prop-([a-z0-9_-]+)=/g)) props.add(m[1]);
  assert.deepEqual([...props].sort(), ['anbieter', 'anzahl', 'art', 'liste', 'position', 'quelle', 'variante', 'weg']);
});
