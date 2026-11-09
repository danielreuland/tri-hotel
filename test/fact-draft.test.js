const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const draft = require('../src/lib/fact-draft');

const input = { value: 'true', trust: '2', evidence_url: '', evidence_text: '', disputed: 'on' };

test('Abgelehnte Zeile behält Wert, Stufe, Fundstelle, Vermerk und Häkchen', () => {
  const r = draft.row({ value: 'true', trust: '1', evidence_url: ' https://x.de/a ', evidence_text: 'Satz', assessment: 'on', disputed: 'on' }, 'evidence');
  assert.deepStrictEqual(r, {
    reason: 'evidence', value: 'true', trust: 1, evidence_url: 'https://x.de/a', evidence_text: 'Satz', assessment: true, disputed: true,
  });
});

test('Mehrfachauswahl bleibt eine Liste, fehlende Felder werden leer, Texte gekürzt', () => {
  const r = draft.row({ value: ['pool_50_hotel', 'pool_25_near'], evidence_text: 'x'.repeat(5000) }, 'evidence');
  assert.deepStrictEqual(r.value, ['pool_50_hotel', 'pool_25_near']);
  assert.strictEqual(r.trust, 2);
  assert.strictEqual(r.assessment, false);
  assert.strictEqual(r.disputed, false);
  assert.strictEqual(r.evidence_text.length, 1000);
  assert.strictEqual(draft.row({ value: 'abc' }, 'unbekannt').reason, 'invalid');
});

test('Entwurf nur bei abgelehnten Zeilen, je Kriterium', () => {
  assert.strictEqual(draft.build('s1', []), null);
  const d = draft.build('s1', [{ id: 'c1', input, reason: 'evidence' }, { id: 'c2', input: { value: 'abc' }, reason: 'invalid' }]);
  assert.strictEqual(d.sub, 's1');
  assert.deepStrictEqual(Object.keys(d.rows), ['c1', 'c2']);
  assert.strictEqual(d.rows.c1.reason, 'evidence');
  assert.strictEqual(d.rows.c2.value, 'abc');
});

test('Entwurf gilt einmal und nur für seine Meldung', () => {
  const session = { factDraft: draft.build('s1', [{ id: 'c1', input, reason: 'evidence' }]) };
  assert.strictEqual(draft.take({ factDraft: draft.build('s1', [{ id: 'c1', input, reason: 'evidence' }]) }, 's2'), null);
  const d = draft.take(session, 's1');
  assert.strictEqual(d.rows.c1.value, 'true');
  assert.strictEqual(session.factDraft, undefined);
  assert.strictEqual(draft.take(session, 's1'), null);
  assert.strictEqual(draft.take({}, 's1'), null);
});

test('Formularwerte: abgelehnte Eingabe geht vor gespeichertem Wert', () => {
  const fact = { trust_level: 4, evidence_url: 'https://alt.de', evidence_text: null, editorial_assessment: false, disputed: false };
  const saved = draft.fields(fact, null);
  assert.deepStrictEqual(saved, { rejected: null, hint: null, trust: 4, evidence_url: 'https://alt.de', evidence_text: '', assessment: false, disputed: false });
  assert.strictEqual(draft.fields(null, null).trust, 2);
  const e = draft.fields(fact, draft.row(input, 'evidence'));
  assert.strictEqual(e.rejected, 'evidence');
  assert.match(e.hint, /Beleg fehlt/);
  assert.strictEqual(e.value, 'true');
  assert.strictEqual(e.trust, 2);
  assert.strictEqual(e.evidence_url, '');
  assert.strictEqual(e.disputed, true);
});

test('Prüfansicht nutzt den Entwurf und lässt sich übersetzen', () => {
  const file = path.join(__dirname, '../src/views/admin/detail.ejs');
  const src = fs.readFileSync(file, 'utf8');
  assert.doesNotThrow(() => ejs.compile(src, { filename: file }));
  assert.match(src, /draftFields\(f, dr\)/);
  assert.match(src, /data-rejected/);
  const route = fs.readFileSync(path.join(__dirname, '../src/routes/admin.js'), 'utf8');
  assert.match(route, /req\.session\.factDraft = draft/);
});
