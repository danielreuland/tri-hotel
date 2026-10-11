const test = require('node:test');
const assert = require('node:assert/strict');
const review = require('../src/services/reviewlist');

const base = () => ({
  sub: { status: 'admin_review', pipeline_log: [] },
  ranking: { entity_label_sg: 'Hotel', formula: { min_completeness: 70 } },
  criteria: [
    { id: 'a', label: 'Becken', max_points: 12, scoring: { type: 'option' } },
    { id: 'b', label: 'Radgarage', max_points: 6, scoring: { type: 'option' } },
    { id: 'k', label: 'Klima', max_points: 10, scoring: { type: 'climate' } },
  ],
  facts: [{ criterion_id: 'a', trust_level: 2, disputed: false }],
  climate: [{ month: 1 }],
  entity: { lat: 1, lng: 2, contact_email: 'x@y.de', attributes: {} },
  result: { ko: false, completeness: 80 },
  images: [], text: { status: 'published' }, textStale: false, inquiryList: [], manualFeatures: [], duplicateOf: null,
});

test('reviewlist: alles erledigt bis auf fehlendes Kriterium -> nur Empfehlung', () => {
  const r = review.build(base());
  assert.equal(r.open, 0);
  assert.equal(r.items.length, 1);
  assert.match(r.items[0].text, /Radgarage \(6\)/);
});

test('reviewlist: Vorschläge, ungefähre Koordinaten, zu geringe Vollständigkeit, fehlgeschlagener Schritt', () => {
  const d = base();
  d.facts.push({ criterion_id: 'b', trust_level: 4, disputed: false });
  d.criteria.push({ id: 'c', label: 'Laufbahn', max_points: 8, scoring: { type: 'bool' } });
  d.entity.attributes.geo_source = 'Postleitzahlgebiet der Anschrift (ungefähr – bitte prüfen)';
  d.result.completeness = 40;
  d.sub.pipeline_log = [
    { step: 'Umgebung (OpenStreetMap)', ok: false, info: 'Overpass 504' },
    { step: 'Umgebung (OpenStreetMap), Versuch 2', ok: true, info: 'ok' },
    { step: 'Klima', ok: false, info: 'Timeout' },
  ];
  const r = review.build(d);
  const texts = r.items.map((i) => i.text).join(' | ');
  assert.match(texts, /1 automatisch ermittelte Wert/);
  assert.match(texts, /ungefähr/);
  assert.ok(!/Umgebung/.test(texts), 'erfolgreiche Wiederholung erledigt den Schritt');
  assert.match(texts, /„Klima“ fehlgeschlagen/);
  assert.equal(r.items[0].level, 'block');
  assert.match(r.items[0].text, /Vollständigkeit 40 %.*Laufbahn \(8\)/);
});

test('reviewlist: ohne Koordinaten blockiert', () => {
  const d = base();
  d.entity.lat = null;
  assert.equal(review.build(d).blockers, 1);
});
