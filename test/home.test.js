const test = require('node:test');
const assert = require('node:assert/strict');
const home = require('../src/services/home');
const seo = require('../src/lib/seo');

test('Startseite: Reihenfolge aus dem Admin, unbekannte Bereiche weg, fehlende hinten angehängt', () => {
  const cfg = home.normalizeConfig({ blocks: [{ key: 'regions' }, { key: 'xyz' }, { key: 'about', hidden: true }, { key: 'regions' }] });
  assert.deepEqual(cfg.map((b) => b.key), ['regions', 'about', 'entities', 'camps']);
  assert.equal(cfg[1].hidden, true);
  assert.deepEqual(home.normalizeConfig({}).map((b) => b.key), home.DEFAULT_ORDER);
  assert.deepEqual(home.normalizeConfig(null).map((b) => b.pick.mode), ['auto', 'auto', 'auto', 'auto']);
});

test('Startseite: Redaktion nur mit Eintrag und bis einschließlich Enddatum', () => {
  assert.deepEqual(home.normalizePick({ mode: 'editorial', slug: '' }), { mode: 'auto' });
  assert.deepEqual(home.normalizePick({ mode: 'editorial', slug: 'a', until: 'morgen' }), { mode: 'editorial', slug: 'a', until: null });
  const day = new Date('2026-11-30T12:00:00Z');
  assert.equal(home.editorialActive({ mode: 'editorial', slug: 'a', until: '2026-11-30' }, day), true);
  assert.equal(home.editorialActive({ mode: 'editorial', slug: 'a', until: '2026-11-29' }, day), false);
  assert.equal(home.editorialActive({ mode: 'editorial', slug: 'a', until: null }, day), true);
  assert.equal(home.editorialActive({ mode: 'auto' }, day), false);
});

test('Startseite: Camp im Tageswechsel – jeder kommt der Reihe nach dran, unabhängig vom Partnerstatus', () => {
  const seen = new Set();
  for (let d = 0; d < 5; d++) seen.add(home.rotationIndex(5, new Date(2026, 10, 1 + d)));
  assert.equal(seen.size, 5);
  assert.equal(home.rotationIndex(0), -1);
  assert.equal(home.rotationIndex(3, new Date(2026, 10, 1)), home.rotationIndex(3, new Date(2026, 10, 1, 23, 59)));
});

test('Startseite: nächster Monat, Listenpfad je Ranking', () => {
  assert.equal(home.nextMonth(new Date(2026, 9, 27)), 11);
  assert.equal(home.nextMonth(new Date(2026, 11, 5)), 1);
  assert.equal(seo.listPath({ is_default: true, entity_label_pl: 'Hotels', slug: 'triathlon-hotel' }), '/hotels');
  assert.equal(seo.listPath({ is_default: false, entity_label_pl: 'Gyms', slug: 'hyrox' }), '/rankings/hyrox');
  assert.match(seo.websiteLd({ name: 'x' }, 'https://x.de', '/hotels').potentialAction.target, /^https:\/\/x\.de\/hotels\?q=/);
});
