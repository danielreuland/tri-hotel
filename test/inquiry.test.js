const test = require('node:test');
const assert = require('node:assert/strict');
const agent = require('../src/services/inquiry-agent');
const { findContactEmail } = require('../src/services/extractor');

const ranking = { name: 'Triathlon-Hotels', entity_label_sg: 'Hotel', entity_label_pl: 'Hotels' };
const entity = { name: 'Hotel Mar Azul', city: 'Palma', country: 'ES' };
const gym = { id: 'g', code: 'rec_gym', label: 'Kraftraum', scoring: { type: 'option', points: { athletic: 3, standard: 2, none: 0 }, labels: { athletic: 'Athletik', standard: 'Standard', none: 'keiner' } } };
const sauna = { id: 's', code: 'rec_sauna', label: 'Sauna', scoring: { type: 'bool', points_true: 2 } };
const terrain = { id: 't', code: 'bike_terrain', label: 'Radrevier', scoring: { type: 'rating', min: 0, max: 6 } };
const climate = { id: 'k', code: 'log_climate', label: 'Klima', scoring: { type: 'climate', metric: 'avg_high_c', bands: [] } };
const ctx = { entity, ranking, criteria: [gym, sauna], language: 'en', brand: 'tri-hotel.de', askPhotos: true };

test('nur Auswahl- und Ja/Nein-Kriterien werden beim Betreiber erfragt', () => {
  assert.ok(agent.isAskable(gym));
  assert.ok(agent.isAskable(sauna));
  assert.ok(!agent.isAskable(terrain), 'Admin-Einstufung');
  assert.ok(!agent.isAskable(climate), 'Klimadaten');
});

test('unklar = unbekannt, strittig oder nur automatisch ermittelt', () => {
  const crits = [gym, sauna, terrain, { ...sauna, id: 's2', code: 'x' }, { ...sauna, id: 's3', code: 'y' }];
  const facts = [
    { criterion_id: 'g', trust_level: 2, disputed: false },
    { criterion_id: 's', trust_level: 4, disputed: false },
    { criterion_id: 's2', trust_level: 1, disputed: true },
    { criterion_id: 's3', trust_level: 1, disputed: false },
  ];
  assert.deepEqual(agent.unclearCriteria(crits, facts).map((c) => c.id), ['s', 's2']);
  assert.deepEqual(agent.unclearCriteria([gym], []).map((c) => c.id), ['g']);
});

test('Sprache: deutschsprachige Länder auf Deutsch, sonst Englisch', () => {
  assert.equal(agent.languageFor('AT'), 'de');
  assert.equal(agent.languageFor('es'), 'en');
});

test('Vorlage enthält Link, Fotobitte und alle Fragen mit gültigen Werten', () => {
  const d = agent.fallbackDraft({ ...ctx, language: 'de' });
  assert.ok(d.body.includes(agent.LINK));
  assert.match(d.body, /Fotos/);
  assert.deepEqual(d.questions.map((q) => q.options.map((o) => o.value)), [['athletic', 'standard', 'none'], ['true', 'false']]);
  const noPhotos = agent.fallbackDraft({ ...ctx, language: 'de', askPhotos: false });
  assert.ok(!/Fotos/.test(noPhotos.body));
});

test('Modell-Entwurf: fremde Links und fehlender Antwortlink werden abgefangen', () => {
  const withUrl = agent.sanitizeDraft({ subject: 'S', body: 'Hello, please visit https://evil.example to answer our questions about your hotel today. ' + agent.LINK, questions: [] }, ctx);
  assert.ok(!withUrl.body.includes('evil.example'), 'fällt auf Vorlage zurück');
  const noLink = agent.sanitizeDraft({ subject: 'S', body: 'Dear team, we would love a few details about your facilities for your profile on our site.', questions: [] }, ctx);
  assert.ok(noLink.body.includes(agent.LINK));
  assert.equal(agent.sanitizeDraft(null, ctx).usedFallback, true);
});

test('Modell-Entwurf: nur angefragte Kriterien, nur gültige Werte, jede Option genau einmal', () => {
  const d = agent.sanitizeDraft({
    subject: 'Quick question',
    body: 'Dear team,\n\nwe have two short questions about your facilities for your profile.\n\n' + agent.LINK + '\n\nKind regards',
    questions: [
      { criterion_code: 'rec_gym', question: 'How is your gym equipped?', options: [{ value: 'athletic', text: 'Squat rack and free weights' }, { value: 'pool_50', text: 'invented' }] },
      { criterion_code: 'swim_pool', question: 'Not requested', options: [] },
    ],
  }, ctx);
  assert.equal(d.questions.length, 2);
  assert.equal(d.questions[0].question, 'How is your gym equipped?');
  assert.deepEqual(d.questions[0].options.map((o) => o.value), ['athletic', 'standard', 'none']);
  assert.equal(d.questions[0].options[0].text, 'Squat rack and free weights');
  assert.equal(d.questions[0].options[1].text, 'Standard', 'fehlender Text aus der Vorlage');
  assert.equal(d.questions[1].criterion_id, 's', 'fehlende Frage aus der Vorlage');
});

test('Antworten werden in Faktenwerte umgesetzt, ungültige verworfen', () => {
  assert.deepEqual(agent.toFactValue(gym, 'athletic'), { option: 'athletic' });
  assert.equal(agent.toFactValue(gym, 'pool'), null);
  assert.deepEqual(agent.toFactValue(sauna, 'false'), { bool: false });
});

test('Kontakt-E-Mail: Hoteldomain und typische Postfächer bevorzugt, Datenschutz-Adressen ignoriert', () => {
  const pages = [
    { url: 'https://www.mar-azul.example/impressum', text: 'Datenschutz: privacy@mar-azul.example · Agentur: kontakt@agentur.example' },
    { url: 'https://www.mar-azul.example/kontakt', text: 'Schreiben Sie uns: Reservierung reservation@mar-azul.example oder direktor@mar-azul.example.' },
  ];
  assert.deepEqual(findContactEmail(pages, 'https://www.mar-azul.example'), { email: 'reservation@mar-azul.example', evidenceUrl: 'https://www.mar-azul.example/kontakt' });
  assert.equal(findContactEmail([{ url: 'u', text: 'keine Adresse' }], 'https://x.example'), null);
});

const consents = require('../src/lib/consents');
const sites = require('../src/services/sites');
const mia = { name: 'Mia', title: 'Digitale Assistenz Datenprüfung' };

test('Agenten-Mails sind immer als KI gekennzeichnet und mit der Persona signiert', () => {
  const de = agent.sanitizeDraft(null, { ...ctx, language: 'de', persona: mia });
  assert.match(de.body, /Mit freundlichen Grüßen\nMia/);
  assert.match(de.body, /Mia · Digitale Assistenz Datenprüfung von tri-hotel\.de/);
  assert.match(de.body, /von unserer KI-Assistenz verfasst/);
  const model = agent.sanitizeDraft({ subject: 'S', body: 'Dear team,\n\nwe have two short questions about your facilities for your profile.\n\n' + agent.LINK + '\n\nKind regards\nMia', questions: [] }, { ...ctx, persona: mia });
  assert.match(model.body, /written by our AI assistant/, 'Hinweis auch, wenn das Modell ihn weglässt');
  assert.ok(model.body.indexOf(agent.LINK) < model.body.indexOf('AI assistant'));
});

test('Einwilligungen: versionierte Wortlaute je Art und Sprache, Marke und Objekt eingesetzt', () => {
  assert.ok(consents.VERSION);
  assert.deepEqual(Object.keys(consents.TYPES), ['photos_profile', 'photos_social', 'partner_contact']);
  assert.match(consents.text('photos_social', 'de', 'hybrid-hotel.de', 'Hotel X'), /hybrid-hotel\.de .*Social-Media.*Hotel X/);
  assert.match(consents.text('partner_contact', 'en', 'tri-hotel.de'), /no influence on rating or ranking/);
  assert.throws(() => consents.text('newsletter', 'de', 'x', 'y'));
});

test('Sites: Paletten liefern alle Farb-Tokens für Hell und Dunkel, Überschreibungen nur gültig', () => {
  const palettes = require('../src/lib/palettes');
  for (const key of Object.keys(palettes.PALETTES)) {
    const r = palettes.resolve({ preset: key });
    assert.equal(Object.keys(r.light).length, palettes.TOKENS.length, `${key} hell vollständig`);
    assert.equal(Object.keys(r.dark).length, palettes.TOKENS.length, `${key} dunkel vollständig`);
  }
  const css = sites.themeCss({ theme: { preset: 'startnummer', light: { cta: '#E8613C', evil: '#000000', primary: 'red;}body{' } } });
  assert.match(css, /--cta:#e8613c/, 'gültige Überschreibung');
  assert.match(css, /--primary:#14213d/, 'ungültiger Wert fällt auf Palette zurück');
  assert.ok(!css.includes('evil') && !css.includes('body{'));
  assert.match(css, /\[data-theme="dark"\]\{--bg:#11161f/);
  assert.match(sites.themeCss({ theme: {} }), /--header-bg:#12345a/, 'ohne Angabe: Pool & Sonne');
  assert.equal(sites.mailFrom({ name: 'tri-hotel.de', mail_from: 'hallo@tri-hotel.de' }, { name: 'Mia', email: 'mia@tri-hotel.de' }), '"Mia · tri-hotel.de" <mia@tri-hotel.de>');
  assert.equal(sites.mailFrom({ name: 'tri-hotel.de', mail_from: 'hallo@tri-hotel.de' }, null), '"tri-hotel.de" <hallo@tri-hotel.de>');
});
