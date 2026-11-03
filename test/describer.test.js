const test = require('node:test');
const assert = require('node:assert/strict');
const describer = require('../src/services/describer');

test('describer.parseBody: Überschriften, Absätze, Listen', () => {
  const blocks = describer.parseBody('Erster Absatz\nzweite Zeile.\n\n## Rad\n\nGute Straßen.\n\n## Gut zu wissen\n- Punkt A\n- Punkt B');
  assert.deepEqual(blocks, [
    { type: 'p', text: 'Erster Absatz zweite Zeile.' },
    { type: 'h', text: 'Rad' },
    { type: 'p', text: 'Gute Straßen.' },
    { type: 'h', text: 'Gut zu wissen' },
    { type: 'ul', items: ['Punkt A', 'Punkt B'] },
  ]);
  assert.deepEqual(describer.parseBody(''), []);
});

test('describer.toBody: älteres Format (Abschnitte mit text, Punkte als Text), Links entfernt', () => {
  const body = describer.toBody({
    sections: [{ title: 'Kurzfazit', text: 'Passt gut. Mehr unter https://example.com' }, { title: 'Leer', text: ' ' }],
    good_to_know: ['Laufbahn nicht bestätigt', ''],
  });
  assert.equal(body, '## Kurzfazit\n\nPasst gut. Mehr unter\n\n## Gut zu wissen\n\n- Laufbahn nicht bestätigt');
});

test('describer.shorten: höchstens max Zeichen, am Wortende gekürzt', () => {
  const s = describer.shorten('Wort '.repeat(60), 160);
  assert.ok(s.length <= 160);
  assert.ok(s.endsWith('…'));
  assert.equal(describer.shorten('Kurz.', 160), 'Kurz.');
});

test('describer.inputHash: gleiche Daten -> gleicher Fingerabdruck', () => {
  const a = { entity: { name: 'X' }, categories: [{ category: 'Rad', known: [] }] };
  assert.equal(describer.inputHash(a), describer.inputHash(JSON.parse(JSON.stringify(a))));
  assert.notEqual(describer.inputHash(a), describer.inputHash({ ...a, entity: { name: 'Y' } }));
});

test('describer.prompt: nutzt Beschriftungen des Rankings, nichts Triathlon-spezifisches', () => {
  const p = describer.prompt({ ranking: { name: 'Hyrox-Gyms', score_name: 'HyScore', entity: 'Gym', entities: 'Gyms' }, score: { label: 'Gut' }, categories: [] });
  assert.match(p, /Hyrox-Gyms/);
  assert.match(p, /HyScore/);
  assert.ok(!/triathlon/i.test(p));
});

test('describer.prompt: Notizen und Mustertexte nur, wenn vorhanden; Styleguide und Verbotsliste immer', () => {
  const base = { ranking: { name: 'Hyrox-Gyms', score_name: 'HyScore', entity: 'Gym', entities: 'Gyms' }, score: { label: 'Gut' }, categories: [] };
  const plain = describer.prompt(base);
  assert.ok(!/notizen: Einschätzung/.test(plain));
  assert.ok(!/Mustertexte/.test(plain));
  assert.match(plain, /Styleguide der Redaktion/);
  assert.match(plain, /Geheimtipp/);
  assert.match(plain, /laut Gym/, 'Quellenregel mit der Objektbezeichnung des Rankings');
  const style = describer.styleOf({ text_style: { guide: 'Immer kurz.', banned: ['Wahnsinn'] } });
  const full = describer.prompt({ ...base, notes: 'Viel Wind' }, { examples: [{ name: 'Anderes Gym', summary: 'S', body: 'B' }], style });
  assert.match(full, /"text": "Viel Wind"/);
  assert.match(full, /Mustertexte – fremde Gyms/);
  assert.ok(!/Anderes Gym/.test(full), 'Name des Mustertexts geht nicht an die KI');
  assert.match(full, /Immer kurz\./);
  assert.match(full, /Wahnsinn/);
  const tpl = describer.promptTemplate({ name: 'Hyrox-Gyms', score_name: 'HyScore', entity_label_sg: 'Gym', entity_label_pl: 'Gyms' });
  assert.match(tpl, /\[Daten des Objekts als JSON/);
  assert.ok(!/triathlon/i.test(tpl));
});

// Beispiel-Eingabe wie aus gather (zweites Ranking, damit nichts Triathlon-spezifisch ist)
function sample(over = {}) {
  return {
    ranking: { name: 'Hyrox-Gyms', score_name: 'HyScore', entity: 'Gym', entities: 'Gyms' },
    entity: { name: 'Box Nord', city: 'Kiel', country: 'Deutschland', region: 'Ostsee', address: 'Hafenstraße 1, 24103 Kiel' },
    score: { label: 'Gut', eligible: true, completeness: 90 },
    categories: [{
      category: 'Geräte', points: 7, max: 10,
      known: [
        { id: 'ski_erg', criterion: 'SkiErg', value: 'ja', points: 4, max: 4, source: 'redaktionell geprüft', quelle: 'geprüft', messwert: '6 Geräte, 0.3 km Luftlinie.' },
        { id: 'sled', criterion: 'Schlitten', value: 'nein', points: 0, max: 3, source: 'redaktionell geprüft', quelle: 'geprüft' },
      ],
      unknown: [{ id: 'wall_balls', criterion: 'Wall Balls', max: 3 }],
    }],
    best_months: 'Mai–September',
    climate: [{ month: 'Juli', max_c: 22, rain_days: 9, sea_c: 18 }],
    features: ['Duschen'],
    context: { comparison: { ski_erg: 'selten – nur 20 % der anderen Gyms erreichen das' }, rank: { platz: 3, von: 40, obere_prozent: 8 }, best_month_list: ['Mai'] },
    ...over,
  };
}

test('describer.inputHash: Fingerabdruck in der bisherigen Form – neue Felder und Vergleich ändern ihn nicht', () => {
  const a = sample();
  const legacy = describer.legacyView(a);
  assert.deepEqual(Object.keys(legacy), ['ranking', 'entity', 'score', 'categories', 'best_months', 'climate', 'features']);
  assert.deepEqual(Object.keys(legacy.categories[0].known[0]), ['criterion', 'value', 'points', 'max', 'source']);
  assert.deepEqual(legacy.categories[0].unknown, ['Wall Balls']);
  assert.deepEqual(legacy.climate[0], { month: 'Juli', max_c: 22, rain_days: 9 });
  const b = sample({ context: { comparison: {}, rank: null, best_month_list: [] }, entity: { ...a.entity, address: 'anders' } });
  assert.equal(describer.inputHash(a), describer.inputHash(b));
  assert.notEqual(describer.inputHash(a), describer.inputHash(sample({ features: ['Duschen', 'Sauna'] })));
});

test('describer.staleness: nur verwendete Angaben zählen; ältere Texte wie bisher; Erinnerung nach 12 Monaten', () => {
  const a = sample();
  const refs = describer.refFingerprints(a, ['ski_erg', 'ort']);
  const text = { body: 'B', status: 'published', published_at: '2026-06-01', fact_refs: refs };
  const now = new Date('2026-11-01');
  assert.equal(describer.staleness(text, sample({ features: ['Sauna'] }), now), null, 'nicht verwendete Leistungen geändert -> nicht veraltet');
  const changed = sample();
  changed.categories[0].known[0] = { ...changed.categories[0].known[0], value: 'nein' };
  assert.deepEqual(describer.staleness(text, changed, now), { reason: 'facts', changed: ['SkiErg'] });
  const nowKnown = sample();
  const old = { ...text, fact_refs: describer.refFingerprints(a, ['wall_balls']) };
  nowKnown.categories[0].unknown = [];
  nowKnown.categories[0].known.push({ id: 'wall_balls', criterion: 'Wall Balls', value: 'ja', points: 3, max: 3, source: 'x', quelle: 'geprüft' });
  assert.equal(describer.staleness(old, nowKnown, now).reason, 'facts', 'offene Angabe jetzt bekannt');
  const legacy = { body: 'B', status: 'published', published_at: '2026-06-01', input_hash: describer.inputHash(a) };
  assert.equal(describer.staleness(legacy, sample({ features: ['Sauna'] }), now).reason, 'facts', 'ohne Fakten-IDs: jede Änderung');
  assert.equal(describer.staleness(legacy, a, now), null);
  assert.equal(describer.staleness(legacy, a, new Date('2027-06-02')).reason, 'age');
  assert.equal(describer.staleness({ ...legacy, status: 'draft' }, a, new Date('2027-06-02')), null);
});

test('describer.compareValue: selten, verbreitet, schwächer – erst ab genug Vergleichsobjekten', () => {
  const ten = (arr) => arr;
  assert.equal(describer.compareValue(4, [0, 0], 'Gyms', 'Gym'), null);
  assert.match(describer.compareValue(4, ten([4, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 'Gyms', 'Gym'), /^selten – nur 10 %/);
  assert.match(describer.compareValue(4, ten([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 'Gyms', 'Gym'), /kein anderes Gym/);
  assert.match(describer.compareValue(4, ten([4, 4, 4, 4, 4, 4, 4, 4, 0, 0]), 'Gyms', 'Gym'), /^verbreitet – 80 %/);
  assert.match(describer.compareValue(0, ten([4, 4, 4, 4, 4, 4, 4, 0, 0, 0]), 'Gyms', 'Gym'), /^schwächer als 70 %/);
  assert.match(describer.compareValue(0, ten([4, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 'Gyms', 'Gym'), /^fehlt auch bei 90 %/);
  assert.deepEqual(describer.rankOf(80, [90, 70, 60, 50, 40, 30, 20, 10]), { platz: 2, von: 9, obere_prozent: 22 });
});

test('describer.measuredDetail: Messwerte aus offenen Daten ohne Redaktionshinweis, nie Zitate der eigenen Website', () => {
  const c = { scoring: { auto: { note: 'Laufbahn laut OpenStreetMap, Luftlinie.' } } };
  assert.equal(describer.measuredDetail({ evidence_url: 'https://www.openstreetmap.org/way/1', evidence_text: 'Laufbahn laut OpenStreetMap, Luftlinie. Nächster Treffer: Stadion, 1.2 km Luftlinie.' }, c, 'https://hotel.example'),
    'Nächster Treffer: Stadion, 1.2 km Luftlinie.');
  assert.equal(describer.measuredDetail({ evidence_url: 'https://www.openstreetmap.org/way/2', evidence_text: 'Becken laut OSM; liegt es im Hotel, bitte auf „im Hotel“ ändern. Becken ca. 26 m lang, 0.1 km Luftlinie.' }, c, null),
    'Becken ca. 26 m lang, 0.1 km Luftlinie.', 'ältere Notiz mit Redaktionshinweis');
  assert.equal(describer.measuredDetail({ evidence_url: 'https://www.hotel.example/spa', evidence_text: 'Unser Spa …' }, c, 'https://hotel.example/'), null);
  assert.equal(describer.measuredDetail({ evidence_url: null, evidence_text: 'x' }, c, null), null);
});

test('describer.checkText: Zahlen ohne Grundlage, verbotene Wörter, Kurzbeschreibung, Sätze ohne Fakten-ID', () => {
  const input = sample();
  const ok = describer.checkText({ summary: 'Die Box Nord in Kiel hat ein SkiErg.', body: 'Im Juli um 22 °C, Wasser 18 °C, 0,3 km Luftlinie.' }, input);
  assert.deepEqual(ok, []);
  const bad = describer.checkText({ summary: 'Ein schöner Geheimtipp mit perfekter Lage und 12 Geräten, '.repeat(3), body: 'Nur 25 Minuten zum Strand.' }, input, { banned: describer.BANNED });
  const types = bad.map((w) => w.type);
  assert.ok(types.includes('number') && /12, 25/.test(bad.find((w) => w.type === 'number').text));
  assert.match(bad.find((w) => w.type === 'word').text, /perfekt, Geheimtipp, schön/);
  assert.match(bad.find((w) => w.type === 'summary').text, /Zeichen/);
  assert.match(describer.checkText({ summary: 'Ein Gym mit SkiErg.', body: '' }, input)[0].text, /nennt den Ort nicht \(Kiel/);
  const parsed = { verdict: [{ text: 'Gut für Ausdauer.', facts: [] }], sections: [{ title: 'Geräte', sentences: [{ text: 'SkiErg da.', facts: ['ski_erg', 'gibts_nicht'] }] }] };
  const basis = describer.checkText({ summary: 'Box Nord in Kiel.', body: 'x' }, input, { parsed }).filter((w) => w.type === 'basis');
  assert.equal(basis.length, 2);
  assert.match(basis[1].text, /gibts_nicht/);
});

test('describer.toBody: Kurzfazit, Passt gut/weniger für, Abschnitte aus Sätzen, Gut zu wissen', () => {
  const body = describer.toBody({
    verdict: [{ text: 'Passt für Ausdauer.', facts: ['ski_erg'] }, { text: 'Kein Schlitten.', facts: ['sled'] }],
    fit_good: [{ text: 'Ergometer-Blöcke', facts: ['ski_erg'] }], fit_less: [],
    sections: [{ title: 'Geräte', sentences: [{ text: 'Ein SkiErg.', facts: ['ski_erg'] }, { text: 'Kein Schlitten.', facts: ['sled'] }] }],
    good_to_know: [{ text: 'Noch nicht geprüft: Wall Balls', facts: ['wall_balls'] }],
  });
  assert.equal(body, '## Kurzfazit\n\nPasst für Ausdauer. Kein Schlitten.\n\n## Passt gut für\n\n- Ergometer-Blöcke\n\n## Geräte\n\nEin SkiErg. Kein Schlitten.\n\n## Gut zu wissen\n\n- Noch nicht geprüft: Wall Balls');
  assert.deepEqual(describer.parseBody(body).map((b) => b.type), ['h', 'p', 'h', 'ul', 'h', 'p', 'h', 'ul']);
});

test('describer.recheck: Befunde der Gegenprüfung bleiben nur, solange der Satz im Text steht', () => {
  const input = sample();
  const prev = [{ type: 'review', sentence: 'SkiErg mit 6 Geräten.', text: '…' }, { type: 'review', sentence: 'Weg damit.', text: '…' }, { type: 'word', text: 'alt' }];
  const out = describer.recheck({ summary: 'Box Nord in Kiel.', body: 'SkiErg mit 6 Geräten.' }, input, describer.styleOf(null), prev);
  assert.deepEqual(out.map((w) => w.sentence || w.type), ['SkiErg mit 6 Geräten.']);
});

test('describer.modelInput: IDs, Quellenstufe, Vergleich und Messwert; keine alten Quellentexte', () => {
  const m = describer.modelInput(sample());
  assert.equal(m.objekt.id, 'ort');
  const k = m.kategorien[0].bekannt[0];
  assert.deepEqual(Object.keys(k), ['id', 'kriterium', 'wert', 'quelle', 'punkte', 'vergleich', 'messwert']);
  assert.equal(m.kategorien[0].offen[0].gewicht, 3);
  assert.equal(m.einordnung.gesamtplatz.platz, 3);
  assert.equal(m.klima.monate[0].wasser_c, 18);
  assert.ok(!JSON.stringify(m).includes('redaktionell geprüft'));
});
