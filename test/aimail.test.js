const test = require('node:test');
const assert = require('node:assert/strict');
const aimail = require('../src/services/aimail');
const agent = require('../src/services/inquiry-agent');

const ranking = { name: 'Triathlon-Hotels', entity_label_sg: 'Hotel', entity_label_pl: 'Hotels' };
const entity = { name: 'Hotel Mar Azul', city: 'Palma', country: 'ES' };
const gym = { id: 'g', code: 'rec_gym', label: 'Kraftraum', scoring: { type: 'option', points: { athletic: 3, none: 0 }, labels: { athletic: 'Athletik', none: 'keiner' } } };
const persona = { name: 'Mia', title: 'Datenprüfung', style: 'Sachlich und knapp, keine Ausrufezeichen.' };

test('fill: Platzhalter, {{LINK}} bleibt, unbekannte bleiben sichtbar', () => {
  const out = aimail.fill('Hallo {{objekt}} von {{marke}}\n{{LINK}}\n{{unbekannt}}', { objekt: 'Mar Azul', marke: 'tri-hotel.de' });
  assert.equal(out, 'Hallo Mar Azul von tri-hotel.de\n{{LINK}}\n{{unbekannt}}');
});

test('fill: Abschnitt {{#fotos}} an und aus, keine dreifachen Leerzeilen', () => {
  const body = 'A\n{{#fotos}}\nFotos bitte.\n{{/fotos}}\nB';
  assert.equal(aimail.fill(body, {}, { fotos: true }), 'A\n\nFotos bitte.\n\nB');
  assert.equal(aimail.fill(body, {}, { fotos: false }), 'A\n\nB');
  assert.equal(aimail.fill('A  \n\n\n\nB'), 'A\n\nB');
});

test('fill: Werte mit {{LINK}} (Erinnerung mit Originaltext) werden nicht erneut ersetzt', () => {
  const out = aimail.fill('Erinnerung\n{{text}}', { text: 'Bitte hier: {{LINK}} – {{objekt}}' });
  assert.equal(out, 'Erinnerung\nBitte hier: {{LINK}} – {{objekt}}');
});

test('unknownPlaceholders: nur erlaubte Platzhalter und Abschnitte je Anlass', () => {
  assert.deepEqual(aimail.unknownPlaceholders('inquiry', '{{objekt}} {{LINK}}', '{{#fotos}}x{{/fotos}}'), []);
  assert.deepEqual(aimail.unknownPlaceholders('inquiry', '{{preis}}', '{{#extra}}x{{/extra}}').sort(), ['#extra', 'preis']);
  assert.deepEqual(aimail.unknownPlaceholders('inquiry_reminder', '{{#fotos}}{{/fotos}}'), ['#fotos']);
});

test('mustList: eine Zeile je Punkt, Aufzählungszeichen und Leerzeilen entfernt', () => {
  assert.deepEqual(aimail.mustList('- eins\n\n• zwei\n  * drei  \n'), ['eins', 'zwei', 'drei']);
  assert.deepEqual(aimail.mustList(null), []);
});

test('stripDisclosure: KI-Hinweis nach „--“ gehört nicht ins Stilbeispiel', () => {
  assert.equal(aimail.stripDisclosure('Text\nGruß Mia\n--\nVerfasst von der KI-Assistenz'), 'Text\nGruß Mia');
  assert.equal(aimail.stripDisclosure('ohne Hinweis'), 'ohne Hinweis');
});

test('Standardtexte: Antwortlink in der Anfrage, Originaltext in der Erinnerung, nur bekannte Platzhalter', () => {
  for (const lang of Object.keys(aimail.LANGUAGES)) {
    const inq = aimail.DEFAULTS.inquiry[lang];
    assert.ok(inq.body.includes(aimail.LINK), lang);
    assert.deepEqual(aimail.unknownPlaceholders('inquiry', inq.subject, inq.body), [], lang);
    const rem = aimail.DEFAULTS.inquiry_reminder[lang];
    assert.ok(rem.body.includes('{{text}}'), lang);
    assert.deepEqual(aimail.unknownPlaceholders('inquiry_reminder', rem.subject, rem.body), [], lang);
  }
});

test('buildPrompt: Persona-Stil, Mustertext, Pflichtpunkte, Stilbeispiel und feste Regeln', () => {
  const template = { subject: 'Frage zu {{objekt}}', body: 'Guten Tag,\n{{LINK}}\n{{#fotos}}FOTOS-ABSCHNITT{{/fotos}}\n{{name}}', must: 'Eintrag ist kostenlos\nPlatzierung nicht käuflich' };
  const example = { subject: 'Alte Anfrage', body: 'Überarbeiteter Text' };
  const prompt = agent.buildPrompt({ entity, ranking, criteria: [gym], language: 'de', brand: 'tri-hotel.de', askPhotos: true, persona, template, example });
  assert.ok(prompt.includes(persona.style));
  assert.ok(prompt.includes('Betreff: Frage zu Hotel Mar Azul'));
  assert.ok(prompt.includes('FOTOS-ABSCHNITT'));
  assert.ok(prompt.includes('- Eintrag ist kostenlos') && prompt.includes('- Platzierung nicht käuflich'));
  assert.ok(prompt.includes('Überarbeiteter Text'));
  for (const rule of aimail.rules({ askPhotos: true })) assert.ok(prompt.includes(rule), rule);
  assert.ok(prompt.includes('rec_gym'));
});

test('buildPrompt ohne Mustertext und Beispiel: keine leeren Abschnitte', () => {
  const prompt = agent.buildPrompt({ entity, ranking, criteria: [gym], language: 'en', brand: 'tri-hotel.de', askPhotos: false });
  assert.ok(!prompt.includes('Mustertext'));
  assert.ok(!prompt.includes('Stilbeispiel'));
  assert.ok(!prompt.includes('Pflichtpunkte'));
  assert.ok(prompt.includes('Nicht nach Fotos fragen.'));
});

test('fallbackDraft mit Mustertext: wörtlich ausgefüllt, Fotos je nach Auswahl', () => {
  const template = aimail.DEFAULTS.inquiry.de;
  const base = { entity, ranking, criteria: [gym], language: 'de', brand: 'tri-hotel.de', persona, template };
  const withPhotos = agent.fallbackDraft({ ...base, askPhotos: true });
  assert.equal(withPhotos.subject, 'Kurze Rückfrage zu Ihrem Profil: Hotel Mar Azul');
  assert.ok(withPhotos.body.includes('tri-hotel.de ist eine unabhängige Übersicht über Hotels'));
  assert.ok(withPhotos.body.includes(aimail.LINK));
  assert.ok(withPhotos.body.includes('Fotos Ihres Hauses'));
  assert.ok(withPhotos.body.trim().endsWith('Mia'));
  assert.ok(!/\{\{(?!LINK)/.test(withPhotos.body), 'keine offenen Platzhalter');
  const noPhotos = agent.fallbackDraft({ ...base, askPhotos: false });
  assert.ok(!noPhotos.body.includes('Fotos Ihres Hauses'));
  assert.equal(noPhotos.questions.length, 1);
});
