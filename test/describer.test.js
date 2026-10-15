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

test('describer.toBody: Abschnitte und „Gut zu wissen“, Links entfernt', () => {
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

test('describer.prompt: Notizen und Stilvorlage nur, wenn vorhanden', () => {
  const base = { ranking: { name: 'Hyrox-Gyms', score_name: 'HyScore', entity: 'Gym', entities: 'Gyms' }, score: { label: 'Gut' }, categories: [] };
  const plain = describer.prompt(base);
  assert.ok(!/Redaktionelle Notizen/.test(plain));
  assert.ok(!/Stilvorlage/.test(plain));
  const full = describer.prompt({ ...base, notes: 'Viel Wind' }, { name: 'Anderes Gym', summary: 'S', body: 'B' });
  assert.match(full, /Redaktionelle Notizen[\s\S]*Viel Wind/);
  assert.match(full, /Stilvorlage[\s\S]*Anderes Gym/);
  const tpl = describer.promptTemplate({ name: 'Hyrox-Gyms', score_name: 'HyScore', entity_label_sg: 'Gym', entity_label_pl: 'Gyms' });
  assert.match(tpl, /\[Daten des Objekts als JSON/);
  assert.ok(!/triathlon/i.test(tpl));
});
