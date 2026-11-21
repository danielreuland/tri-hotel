// B-45: Muster für Title/H1/Beschreibung (Hotel-, Regions-, Länderseiten), Längen, keine leeren Platzhalter, keine erfundenen Werte.
const test = require('node:test');
const assert = require('node:assert');
const seo = require('../src/lib/seo');
const pageSeo = require('../src/services/page-seo');

// Muster wie in db/migrations/125_seo_muster.sql (Triathlon) und ein zweites Ranking (Hyrox), damit nichts Triathlon-spezifisch im Code steckt
const TRI = {
  name: 'Triathlon-Hotels', score_name: 'TriScore', entity_label_pl: 'Hotels', entity_label_sg: 'Hotel',
  content: {
    area_title: 'Triathlon-Hotels {name} im {score}-Vergleich', area_h1: 'Triathlon-Hotels {in}',
    country_title: 'Triathlon-Hotels {in}', country_h1: 'Triathlon-Hotels {in}',
    entity_title: ['{name}: Training, Becken und {scorename}', '{name}: Training, Becken, {scorename}', '{name}: Training und {scorename}', '{name} im {scorename}-Check'],
    entity_h1: '{name} – Trainingsbedingungen im Check',
  },
};
const HYROX = { name: 'Hyrox-Gyms', score_name: 'HybridScore', entity_label_pl: 'Gyms', entity_label_sg: 'Gym', content: { area_h1: 'Gyms {in}' } };
const BRAND = 'tri-hotel.de';
const NO_GAPS = /\{|\}|undefined|null|NaN|\(\s*\)|\s[,.]|::|^\s|\s$/;

const areaFill = (ranking, area) => (t) => seo.fillTemplate(t, { in: area.nameIn, name: area.name, score: ranking.score_name });

test('fitTitle: Zusatz „| tri-hotel.de“ nur, wenn er passt; nie doppelt', () => {
  assert.equal(seo.fitTitle('Triathlon-Hotels in Österreich', BRAND), 'Triathlon-Hotels in Österreich | tri-hotel.de');
  assert.equal(seo.fitTitle('Triathlon-Trainingslager: Hotels im Vergleich', BRAND), 'Triathlon-Trainingslager: Hotels im Vergleich | tri-hotel.de');
  assert.equal(seo.fitTitle('Triathlon-Camps 2027: Anbieter und Termine', BRAND), 'Triathlon-Camps 2027: Anbieter und Termine | tri-hotel.de');
  const long = 'Triathlon-Hotels Gran Canaria im TriScore-Vergleich';
  assert.equal(seo.fitTitle(long, BRAND), long, 'zu lang mit Zusatz → ohne Zusatz, nicht abgeschnitten');
  assert.equal(seo.fitTitle('Kontakt | tri-hotel.de', BRAND), 'Kontakt | tri-hotel.de');
  for (const t of ['Triathlon-Trainingslager: Hotels im Vergleich', 'Triathlon-Camps 2027: Anbieter und Termine', 'Triathlon-Hotels in Österreich']) {
    assert.ok(seo.fitTitle(t, BRAND).length <= seo.TITLE_MAX, t);
  }
});

test('Regions- und Länderseiten: Muster mit Präposition je Region, Override vor Muster', () => {
  const regions = [
    { type: 'region', name: 'Mallorca', nameIn: 'auf Mallorca' }, { type: 'region', name: 'Lanzarote', nameIn: 'auf Lanzarote' },
    { type: 'region', name: 'Fuerteventura', nameIn: 'auf Fuerteventura' }, { type: 'region', name: 'Tirol', nameIn: 'in Tirol' },
    { type: 'region', name: 'Gran Canaria', nameIn: 'auf Gran Canaria' }, { type: 'region', name: 'Teneriffa', nameIn: 'auf Teneriffa' },
  ];
  for (const area of regions) {
    const t = pageSeo.areaTexts({ content: TRI.content, area, ranking: TRI, override: null, fill: areaFill(TRI, area) });
    assert.equal(t.title, `Triathlon-Hotels ${area.name} im TriScore-Vergleich`);
    assert.equal(t.h1, `Triathlon-Hotels ${area.nameIn}`);
    assert.ok(seo.fitTitle(t.title, BRAND).length <= seo.TITLE_MAX, t.title);
    assert.doesNotMatch(t.title + t.h1, NO_GAPS);
  }
  const at = { type: 'country', name: 'Österreich', nameIn: seo.countryIn('AT') };
  const c = pageSeo.areaTexts({ content: TRI.content, area: at, ranking: TRI, override: null, fill: areaFill(TRI, at) });
  assert.equal(seo.fitTitle(c.title, BRAND), 'Triathlon-Hotels in Österreich | tri-hotel.de');
  assert.equal(c.h1, 'Triathlon-Hotels in Österreich');
  const lz = regions[1];
  const o = pageSeo.areaTexts({ content: TRI.content, area: lz, ranking: TRI, override: { title: 'Triathlon- und Sporthotels Lanzarote im Vergleich', h1: null }, fill: areaFill(TRI, lz) });
  assert.equal(o.title, 'Triathlon- und Sporthotels Lanzarote im Vergleich');
  assert.equal(o.h1, 'Triathlon-Hotels auf Lanzarote', 'leeres Feld = Muster');
  // zweites Ranking: eigene Vorlage bzw. Rückfall ohne Triathlon-Begriffe
  const h = pageSeo.areaTexts({ content: HYROX.content, area: at, ranking: HYROX, override: null, fill: areaFill(HYROX, at) });
  assert.equal(h.h1, 'Gyms in Österreich');
  assert.equal(h.title, 'Gyms in Österreich – Ranking nach HybridScore');
  assert.doesNotMatch(h.title + h.h1, /Triathlon|TriScore/);
});

test('Hotelseiten: Title ≤ 60 ohne Abschneiden bei normalen Namen, H1 nach Muster', () => {
  const names = ['Club La Santa', 'Barceló Lanzarote Active Resort', 'Playitas Hotel', 'Playitas Aparthotel', 'Hotel Zafiro Palace Alcudia'];
  for (const name of names) {
    const t = seo.entityTitleFromTemplates(TRI.content.entity_title, { name, ort: 'Lanzarote', score: 91, scorename: 'TriScore' });
    assert.ok(t.length <= seo.TITLE_MAX, t);
    assert.ok(t.startsWith(`${name}:`) || t.startsWith(`${name} im`), t);
    assert.doesNotMatch(t, NO_GAPS);
  }
  assert.equal(seo.entityTitleFromTemplates(TRI.content.entity_title, { name: 'Club La Santa', scorename: 'TriScore' }), 'Club La Santa: Training, Becken und TriScore');
  assert.equal(seo.entityTitleFromTemplates(TRI.content.entity_title, { name: 'Barceló Lanzarote Active Resort', scorename: 'TriScore' }), 'Barceló Lanzarote Active Resort: Training, Becken, TriScore');
  const veryLong = seo.entityTitleFromTemplates(TRI.content.entity_title, { name: 'Club Pollentia Resort & Spa Triathlon Center Alcúdia Mallorca', scorename: 'TriScore' });
  assert.ok(veryLong.length <= seo.TITLE_MAX, veryLong);
  assert.equal(seo.fillTemplate(TRI.content.entity_h1, { name: 'Club La Santa' }), 'Club La Santa – Trainingsbedingungen im Check');
});

test('Meta-Beschreibung der Hotelseite: nur vorhandene Werte, ≤ 155 Zeichen', () => {
  const full = seo.entityDescription({
    name: 'Club La Santa', place: 'Tinajo', scoreName: 'TriScore', score: 91, label: 'Top-Trainingshotel',
    facts: ['50-m-Becken im Hotel', 'Radgarage: abschließbar + videoüberwacht', 'Flughafen: ≤ 60 min'], checked: 27,
  });
  assert.ok(full.length <= seo.DESC_MAX, full);
  assert.match(full, /^Club La Santa \(Tinajo\): TriScore 91 – Top-Trainingshotel\. 50-m-Becken im Hotel/);
  assert.match(full, /27 geprüfte Werte, Herkunft je Wert\.$/);
  assert.doesNotMatch(full, NO_GAPS);
  // ohne Score (nicht im Ranking): kein Score, keine Stufe
  const noScore = seo.entityDescription({ name: 'Hotel X', place: null, scoreName: 'TriScore', score: null, label: null, facts: ['25-m-Becken ≤ 5 km'], checked: 0 });
  assert.equal(noScore, 'Hotel X: 25-m-Becken ≤ 5 km. Herkunft je Wert öffentlich.');
  assert.doesNotMatch(noScore, /TriScore|undefined|null/);
  // ohne alles: keine leeren Doppelpunkte oder Listen
  const bare = seo.entityDescription({ name: 'Hotel Y', scoreName: 'TriScore', score: null, facts: [], checked: 0 });
  assert.equal(bare, 'Hotel Y. Herkunft je Wert öffentlich.');
  // Ort steckt schon im Namen → nicht doppelt
  assert.match(seo.entityDescription({ name: 'Playitas Hotel Las Playitas', place: 'Las Playitas', scoreName: 'TriScore', score: 88, label: 'Top', facts: [], checked: 1 }),
    /^Playitas Hotel Las Playitas: TriScore 88 – Top\. 1 geprüfte Wert/);
  // zu viele/lange Fakten: von hinten weglassen statt abschneiden
  const many = seo.entityDescription({ name: 'Hotel mit sehr langem Namen am Meer', place: 'Costa Teguise', scoreName: 'HybridScore', score: 77, label: 'Sehr gut geeignet',
    facts: ['Gym mit allen Stationen im Haus', 'Schlitten und Rudergeräte in ausreichender Zahl', 'Kältebad und Sauna'], checked: 30 });
  assert.ok(many.length <= seo.DESC_MAX, many);
  assert.ok(!many.includes('…'), many);
});

test('page-seo.clean: leere Felder = null, Länge begrenzt', () => {
  assert.deepEqual(pageSeo.clean({ title: '  ', h1: ' Triathlon-Hotels  auf Mallorca ', description: '' }), { title: null, h1: 'Triathlon-Hotels auf Mallorca', description: null });
  assert.equal(pageSeo.clean({ title: 'x'.repeat(500) }).title.length, 120);
});

test('Saisonjahr für /trainingscamp: ab Oktober das nächste Jahr (Europe/Berlin)', () => {
  assert.equal(seo.seasonYear(new Date('2026-11-21T12:00:00Z')), 2027);
  assert.equal(seo.seasonYear(new Date('2027-03-01T12:00:00Z')), 2027);
  assert.equal(seo.seasonYear(new Date('2027-09-30T21:59:00Z')), 2027);
  assert.equal(seo.seasonYear(new Date('2027-09-30T22:30:00Z')), 2028, 'Mitternacht in Berlin zählt');
  assert.equal(seo.seasonYear(new Date('2027-05-01T12:00:00Z'), 5), 2028);
});
