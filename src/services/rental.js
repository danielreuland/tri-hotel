// Merkmal „Ferienwohnung / Ferienhaus buchbar (Selbstversorger mit Küche)“ am Objekt (Ratgeber Ferienwohnung, US1).
// Ablage in entities.attributes.vacation_rental, keine eigene Spalte:
//   { value: true, evidence_url, evidence_text, editorial_assessment, set_at, set_by: 'admin', admin_id }
// Das Merkmal ist eine Faktenaussage und braucht wie jeder Wert der Stufe 2 einen Beleg (lib/evidence.js):
// Fundstelle, Vermerk oder ausdrücklich „Einschätzung der Redaktion“. Entfernen geht ohne Beleg.
// Neutralität: Das Merkmal ändert weder Score noch Reihenfolge – es wählt nur aus (Liste im Ratgeber, Filter).
const db = require('../db');
const evidence = require('../lib/evidence');
const { logAction } = require('../lib/audit');

const KEY = 'vacation_rental';
const MAX_TEXT = 1000;

// Hat das Objekt das Merkmal? Fehlt der Schlüssel oder ist value nicht true: nein
function has(entityOrAttributes) {
  const a = entityOrAttributes && (entityOrAttributes.attributes !== undefined ? entityOrAttributes.attributes : entityOrAttributes);
  return Boolean(a && a[KEY] && a[KEY].value === true);
}

const str = (v, max = MAX_TEXT) => (v === undefined || v === null ? '' : String(v)).trim().slice(0, max);

// Formular → Eingabe (roh, gekürzt). Kästchen „value“, Belegfelder wie bei den Faktenwerten.
function readForm(b = {}) {
  return {
    value: b.value === 'on' || b.value === 'true' || b.value === true,
    evidence_url: str(b.evidence_url),
    evidence_text: str(b.evidence_text),
    editorial_assessment: b.assessment === 'on' || b.assessment === true,
  };
}

// Prüfen: Setzen nur mit Beleg (http/https-Fundstelle, Vermerk oder Einschätzung). Ergebnis { ok, error, record }
function validate(input, now = new Date()) {
  if (!input.value) return { ok: true, record: null };
  if (input.evidence_url && !/^https?:\/\/[^\s]+\.[^\s]+/i.test(input.evidence_url)) {
    return { ok: false, error: 'Fundstelle: vollständige Adresse mit https:// angeben.' };
  }
  const rec = {
    value: true,
    evidence_url: input.evidence_url || null,
    evidence_text: input.evidence_text || null,
    editorial_assessment: Boolean(input.editorial_assessment && !input.evidence_url && !input.evidence_text),
    set_at: now.toISOString(),
    set_by: 'admin',
  };
  if (evidence.kind(rec) === 'none') {
    return { ok: false, error: 'Beleg fehlt: Fundstelle, Vermerk oder „Einschätzung der Redaktion“ ergänzen.' };
  }
  return { ok: true, record: rec };
}

// Hat sich etwas geändert? (Beleg zählt mit, Zeitpunkt nicht)
function same(oldRec, newRec) {
  if (!oldRec || oldRec.value !== true) return !newRec;
  if (!newRec) return false;
  return ['evidence_url', 'evidence_text', 'editorial_assessment'].every((k) => (oldRec[k] || null) === (newRec[k] || null));
}

// Speichern mit Audit-Eintrag (vacation_rental.set / vacation_rental.unset). Ergebnis { ok, error, changed, action }
async function save(entityId, input, adminId, client = db) {
  const v = validate(input);
  if (!v.ok) return { ok: false, error: v.error };
  const row = await client.query('SELECT attributes FROM entities WHERE id = $1', [entityId]).then((r) => r.rows[0]);
  if (!row) return { ok: false, error: 'Objekt nicht gefunden.' };
  const old = (row.attributes || {})[KEY] || null;
  if (same(old, v.record)) return { ok: true, changed: false };
  if (v.record) {
    const rec = { ...v.record, admin_id: adminId || null };
    await client.query(`UPDATE entities SET attributes = COALESCE(attributes, '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb), updated_at = now() WHERE id = $1`,
      [entityId, KEY, JSON.stringify(rec)]);
    const action = `${KEY}.set`;
    await logAction(adminId, 'entity', entityId, action, {
      old: old && old.value === true ? { evidence_url: old.evidence_url || null, evidence_text: old.evidence_text || null, editorial_assessment: Boolean(old.editorial_assessment) } : null,
      new: { evidence_url: rec.evidence_url, evidence_text: rec.evidence_text, editorial_assessment: rec.editorial_assessment },
      evidence: evidence.kind(rec),
    }, client);
    return { ok: true, changed: true, action };
  }
  await client.query(`UPDATE entities SET attributes = attributes - $2::text, updated_at = now() WHERE id = $1`, [entityId, KEY]);
  const action = `${KEY}.unset`;
  await logAction(adminId, 'entity', entityId, action, { old: old ? { evidence_url: old.evidence_url || null, evidence_text: old.evidence_text || null, editorial_assessment: Boolean(old.editorial_assessment) } : null }, client);
  return { ok: true, changed: true, action };
}

// SQL-Bedingung für Listen (Alias der Objekt-Tabelle wählbar)
const sqlHas = (alias = 'e') => `(${alias}.attributes->'${KEY}'->>'value') = 'true'`;

module.exports = { KEY, has, readForm, validate, same, save, sqlHas };
