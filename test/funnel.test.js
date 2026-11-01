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
