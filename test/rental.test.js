const test = require('node:test');
const assert = require('node:assert/strict');
const rental = require('../src/services/rental');

// Client-Attrappe: merkt sich alle Abfragen, liefert für SELECT die gespeicherten Attribute
function fakeClient(attributes) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (/^SELECT attributes FROM entities/.test(sql)) return { rows: attributes === undefined ? [] : [{ attributes }] };
      return { rows: [] };
    },
  };
}
const audit = (c) => c.calls.filter((q) => /INSERT INTO admin_actions/.test(q.sql)).map((q) => ({ action: q.params[4], diff: JSON.parse(q.params[5]) }));
const updates = (c) => c.calls.filter((q) => /^UPDATE entities/.test(q.sql));

test('Ferienwohnung: Merkmal nur bei value = true', () => {
  assert.equal(rental.has({ attributes: { vacation_rental: { value: true } } }), true);
  assert.equal(rental.has({ attributes: { vacation_rental: { value: 'true' } } }), false);
  assert.equal(rental.has({ attributes: {} }), false);
  assert.equal(rental.has({ attributes: null }), false);
  assert.equal(rental.has({ vacation_rental: { value: true } }), true, 'auch direkt mit den Attributen');
});

test('Ferienwohnung: Setzen ohne Beleg wird abgelehnt, mit Fundstelle, Vermerk oder Einschätzung angenommen', () => {
  assert.equal(rental.validate(rental.readForm({ value: 'on' })).ok, false);
  assert.match(rental.validate(rental.readForm({ value: 'on' })).error, /Beleg fehlt/);
  assert.equal(rental.validate(rental.readForm({ value: 'on', evidence_url: 'keine adresse' })).ok, false);
  const link = rental.validate(rental.readForm({ value: 'on', evidence_url: 'https://villa.example/apartments' }));
  assert.equal(link.ok, true);
  assert.equal(link.record.value, true);
  assert.equal(link.record.set_by, 'admin');
  assert.equal(rental.validate(rental.readForm({ value: 'on', evidence_text: 'Telefonat 05.11.' })).ok, true);
  const ass = rental.validate(rental.readForm({ value: 'on', assessment: 'on' }));
  assert.equal(ass.ok, true);
  assert.equal(ass.record.editorial_assessment, true);
  // Einschätzung nur, wenn es keinen Beleg gibt
  assert.equal(rental.validate(rental.readForm({ value: 'on', assessment: 'on', evidence_text: 'x' })).record.editorial_assessment, false);
  // Entfernen geht ohne Beleg
  assert.deepEqual(rental.validate(rental.readForm({})), { ok: true, record: null });
});

test('Ferienwohnung: Speichern schreibt Attribut und Audit-Eintrag mit Beleg', async () => {
  const c = fakeClient({});
  const r = await rental.save('e1', rental.readForm({ value: 'on', evidence_url: 'https://villa.example/apartments' }), 'admin-1', c);
  assert.deepEqual([r.ok, r.changed, r.action], [true, true, 'vacation_rental.set']);
  const [u] = updates(c);
  assert.match(u.sql, /attributes = COALESCE\(attributes, '\{\}'::jsonb\) \|\|/);
  assert.equal(JSON.parse(u.params[2]).evidence_url, 'https://villa.example/apartments');
  const [a] = audit(c);
  assert.equal(a.action, 'vacation_rental.set');
  assert.equal(a.diff.new.evidence_url, 'https://villa.example/apartments');
  assert.equal(a.diff.evidence, 'link');
});

test('Ferienwohnung: ohne Beleg nichts gespeichert, kein Audit', async () => {
  const c = fakeClient({});
  const r = await rental.save('e1', rental.readForm({ value: 'on' }), 'admin-1', c);
  assert.equal(r.ok, false);
  assert.equal(c.calls.length, 0);
});

test('Ferienwohnung: Entfernen ohne Beleg, Audit „unset“; unverändert = kein Eintrag', async () => {
  const old = { vacation_rental: { value: true, evidence_text: 'Telefonat 05.11.', set_at: '2026-11-19T10:00:00Z' } };
  const c = fakeClient(old);
  const r = await rental.save('e1', rental.readForm({}), 'admin-1', c);
  assert.deepEqual([r.ok, r.changed, r.action], [true, true, 'vacation_rental.unset']);
  assert.match(updates(c)[0].sql, /attributes - \$2::text/);
  assert.equal(audit(c)[0].diff.old.evidence_text, 'Telefonat 05.11.');

  const same = fakeClient(old);
  const r2 = await rental.save('e1', rental.readForm({ value: 'on', evidence_text: 'Telefonat 05.11.' }), 'admin-1', same);
  assert.equal(r2.changed, false);
  assert.equal(audit(same).length, 0);
  const none = fakeClient({});
  assert.equal((await rental.save('e1', rental.readForm({}), 'admin-1', none)).changed, false, 'nicht gesetzt bleibt nicht gesetzt');
});

test('Ferienwohnung: SQL-Bedingung für Filter und Listen', () => {
  assert.equal(rental.sqlHas('e'), "(e.attributes->'vacation_rental'->>'value') = 'true'");
});
