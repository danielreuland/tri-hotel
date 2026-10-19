const test = require('node:test');
const assert = require('node:assert/strict');
const agent = require('../src/services/inquiry-agent');
const aimail = require('../src/services/aimail');
const inquiries = require('../src/services/inquiries');

const ranking = { name: 'Triathlon-Hotels', entity_label_sg: 'Hotel', entity_label_pl: 'Hotels', entity_type: 'hotel' };
const entity = { name: 'Hotel Mar Azul', city: 'Palma', country: 'ES' };
const gym = { id: 'g', code: 'rec_gym', label: 'Kraftraum', scoring: { type: 'option', points: { athletic: 3, standard: 2, none: 0 }, labels: { athletic: 'Athletik', standard: 'Standard', none: 'keiner' } } };
const sauna = { id: 's', code: 'rec_sauna', label: 'Sauna', scoring: { type: 'bool', points_true: 2 } };
const terrain = { id: 't', code: 'bike_terrain', label: 'Radrevier', scoring: { type: 'rating', min: 0, max: 6 } };
const garage = { id: 'fg', code: 'bike_garage', label: 'Radgarage' };
const laundry = { id: 'fl', code: 'laundry', label: 'Waschraum' };
const facts = {
  g: { criterion_id: 'g', value: { option: 'standard' }, trust_level: 2, disputed: false },
  s: { criterion_id: 's', value: { bool: true }, trust_level: 4, disputed: false },
};
const confirm = { criteria: [gym, sauna], features: [garage], offer: [laundry] };

test('formValue: Faktwert in Formular-Schreibweise, ungültige Werte ergeben null', () => {
  assert.equal(agent.formValue(gym, { option: 'standard' }), 'standard');
  assert.equal(agent.formValue(gym, { option: 'gibtsnicht' }), null);
  assert.equal(agent.formValue(sauna, { bool: false }), 'false');
  assert.equal(agent.formValue(sauna, null), null);
});

test('confirmCount zählt bekannte Werte und erfasste Leistungen, nicht die „außerdem“-Liste', () => {
  assert.equal(agent.confirmCount(confirm), 3);
  assert.equal(agent.confirmCount(null), 0);
});

test('fallbackConfirmations: aktueller Wert mit Text, Ja/Nein in der Sprache, Leistungen mit known', () => {
  const en = agent.fallbackConfirmations(confirm, facts, 'en');
  assert.deepEqual(en.criteria.map((c) => [c.criterion_id, c.current, c.current_text]), [['g', 'standard', 'Standard'], ['s', 'true', 'yes']]);
  assert.deepEqual(en.criteria[1].options.map((o) => o.text), ['yes', 'no']);
  assert.deepEqual(en.features, [{ feature_id: 'fg', text: 'Radgarage', known: true }, { feature_id: 'fl', text: 'Waschraum', known: false }]);
  // ohne bekannten Wert keine Bestätigung
  assert.equal(agent.fallbackConfirmations({ criteria: [gym], features: [] }, {}, 'de').criteria.length, 0);
  assert.deepEqual(agent.fallbackConfirmations({ criteria: [], features: [], offer: [] }, {}, 'de'), {});
});

test('parseConfirmAnswers: stimmt / stimmt nicht / weiß nicht', () => {
  const conf = agent.fallbackConfirmations(confirm, facts, 'de');
  const r = agent.parseConfirmAnswers(conf, { k_g: 'ok', k_s: 'wrong', kv_s: 'false', kc_s: 'seit 2025 geschlossen' }, [gym, sauna]);
  assert.deepEqual(r.criteria, [
    { criterionId: 'g', value: { option: 'standard' }, previous: { option: 'standard' }, comment: null },
    { criterionId: 's', value: { bool: false }, previous: { bool: true }, comment: 'seit 2025 geschlossen' },
  ]);
  assert.deepEqual(r.incomplete, []);
  const u = agent.parseConfirmAnswers(conf, { k_g: 'unknown', k_s: 'wrong', kv_s: '' }, [gym, sauna]);
  assert.equal(u.criteria.length, 0);
  assert.deepEqual(u.incomplete, ['Sauna'], '„stimmt nicht“ ohne Auswahl ist unvollständig');
  // ungültiger Korrekturwert zählt nicht
  assert.equal(agent.parseConfirmAnswers(conf, { k_g: 'wrong', kv_g: 'luxus' }, [gym, sauna]).criteria.length, 0);
});

test('parseConfirmAnswers: erfasste Leistungen nur mit „Liste geprüft“, zusätzliche nur angehakt', () => {
  const conf = agent.fallbackConfirmations(confirm, facts, 'de');
  // Haken stehen (vorausgefüllt), aber Liste nicht geprüft → keine Aussage
  assert.deepEqual(agent.parseConfirmAnswers(conf, { f_fg: 'on' }, [gym, sauna]).features, []);
  // geprüft, Radgarage abgehakt → wird nicht angeboten; Waschraum neu angehakt
  assert.deepEqual(agent.parseConfirmAnswers(conf, { features_checked: 'on', f_fl: 'on' }, [gym, sauna]).features, [
    { featureId: 'fg', offered: false, known: true },
    { featureId: 'fl', offered: true, known: false },
  ]);
  assert.deepEqual(agent.parseConfirmAnswers(conf, { features_checked: 'on', f_fg: 'on' }, [gym, sauna]).features, [
    { featureId: 'fg', offered: true, known: true },
  ]);
});

test('fallbackDraft: Abschnitt {{#bestaetigen}} mit Anzahl nur bei Bestätigungen', () => {
  const base = { entity, ranking, criteria: [], language: 'de', brand: 'tri-hotel.de', askPhotos: false, template: aimail.DEFAULTS.inquiry.de, facts };
  const withConfirm = agent.fallbackDraft({ ...base, confirm });
  assert.ok(withConfirm.body.includes('Außerdem haben wir 3 Angaben'));
  assert.equal(withConfirm.confirmations.criteria.length, 2);
  const without = agent.fallbackDraft(base);
  assert.ok(!without.body.includes('Außerdem haben wir'));
  assert.ok(!/\{\{(?!LINK)/.test(without.body), 'keine offenen Platzhalter');
});

test('sanitizeDraft: übersetzte Bezeichnungen übernehmen, Werte und Auswahl bleiben aus dem System', () => {
  const ctx = { entity, ranking, criteria: [], language: 'en', brand: 'tri-hotel.de', askPhotos: false, template: aimail.DEFAULTS.inquiry.en, facts, confirm };
  const model = {
    subject: 'Quick check', body: `Dear Sir or Madam,\n\nplease check a few details about your hotel for our overview.\n\n${agent.LINK}\n\nKind regards\nMia`, questions: [],
    confirm_items: [{ criterion_code: 'rec_gym', label: 'Gym', options: [{ value: 'standard', text: 'standard gym' }, { value: 'hack', text: 'x' }] }],
    feature_items: [{ code: 'bike_garage', text: 'Bike storage' }, { code: 'unbekannt', text: 'nope' }],
  };
  const d = agent.sanitizeDraft(model, ctx);
  const g = d.confirmations.criteria.find((c) => c.criterion_id === 'g');
  assert.equal(g.label, 'Gym');
  assert.equal(g.current_text, 'standard gym');
  assert.deepEqual(g.options.map((o) => o.value), ['athletic', 'standard', 'none'], 'nur gültige Werte');
  assert.equal(d.confirmations.criteria.find((c) => c.criterion_id === 's').label, 'Sauna', 'ohne Übersetzung bleibt die Bezeichnung');
  assert.deepEqual(d.confirmations.features.map((f) => f.text), ['Bike storage', 'Waschraum']);
});

test('buildPrompt: Anzahl in einem Satz, Liste nur für das Formular', () => {
  const prompt = agent.buildPrompt({ entity, ranking, criteria: [], language: 'de', brand: 'tri-hotel.de', askPhotos: false, facts, confirm, template: aimail.DEFAULTS.inquiry.de });
  assert.ok(prompt.includes('3 bereits erfasste Angaben'));
  assert.ok(prompt.includes('es geht um die Bestätigung bekannter Angaben'));
  assert.ok(prompt.includes('- rec_gym: Kraftraum'));
  assert.ok(prompt.includes('- bike_garage: Radgarage') && prompt.includes('- laundry: Waschraum'));
  assert.ok(prompt.includes('Außerdem haben wir 3 Angaben'), 'Mustertext mit Abschnitt');
});

test('aimail: {{anzahl}} und {{#bestaetigen}} sind erlaubt', () => {
  assert.deepEqual(aimail.unknownPlaceholders('inquiry', '{{anzahl}}', '{{#bestaetigen}}x{{/bestaetigen}}'), []);
});

test('buttonKind: Knopftext passend zum Inhalt', () => {
  assert.equal(inquiries.buttonKind({ criteria_ids: ['a'], ask_photos: true }), 'answer');
  assert.equal(inquiries.buttonKind({ criteria_ids: [], confirm_feature_ids: ['f'], ask_photos: true }), 'confirm');
  assert.equal(inquiries.buttonKind({ criteria_ids: [], confirm_criteria_ids: [], confirm_feature_ids: [], ask_photos: true }), 'photos');
});

test('defaultConfirmSelection: Stufe 2 und 4, nicht strittig, nicht gefragt, keine Admin-Einstufungen', () => {
  const factRows = [
    { criterion_id: 'g', value: { option: 'standard' }, trust_level: 2, disputed: false },
    { criterion_id: 's', value: { bool: true }, trust_level: 1, disputed: false },
    { criterion_id: 't', value: { number: 4 }, trust_level: 2, disputed: false },
  ];
  assert.deepEqual(inquiries.defaultConfirmSelection([gym, sauna, terrain], factRows, [], ['fg']), { criteriaIds: ['g'], featureIds: ['fg'] });
  assert.deepEqual(inquiries.defaultConfirmSelection([gym], factRows, ['g'], []).criteriaIds, [], 'gefragte Werte nicht doppelt');
  assert.deepEqual(inquiries.defaultConfirmSelection([gym], [{ ...factRows[0], disputed: true }], [], []).criteriaIds, []);
});
