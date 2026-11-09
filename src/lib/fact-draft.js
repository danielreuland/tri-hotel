// Abgelehnte Eingaben der Faktenmaske (Admin): Lehnt der Server eine Zeile ab (Beleg fehlt, ungültiger Wert),
// bleibt die Eingabe für genau einen Seitenaufruf in der Sitzung und wird wieder ins Formular gesetzt –
// sonst lädt die Seite den Stand aus der Datenbank und die Eingabe ist weg.

const REASONS = {
  evidence: 'Beleg fehlt: Fundstelle, Vermerk oder „Einschätzung der Redaktion“ ergänzen',
  invalid: 'Wert ungültig',
};
const MAX_TEXT = 1000;
const MAX_VALUE = 200;

const str = (v, max) => (v === undefined || v === null ? '' : String(v)).slice(0, max);

// Eine Formularzeile, wie sie abgeschickt wurde (roh, nur gekürzt) + Grund der Ablehnung
function row(input, reason) {
  const f = input || {};
  return {
    reason: REASONS[reason] ? reason : 'invalid',
    value: Array.isArray(f.value) ? f.value.slice(0, 50).map((v) => str(v, MAX_VALUE)) : str(f.value, MAX_VALUE),
    trust: Number(f.trust) || 2,
    evidence_url: str(f.evidence_url, MAX_TEXT).trim(),
    evidence_text: str(f.evidence_text, MAX_TEXT),
    assessment: f.assessment === 'on',
    disputed: f.disputed === 'on',
  };
}

// Entwurf für die Sitzung; null, wenn nichts abgelehnt wurde
function build(submissionId, rejected) {
  if (!rejected || !rejected.length) return null;
  const rows = {};
  rejected.forEach((r) => { rows[r.id] = row(r.input, r.reason); });
  return { sub: String(submissionId), rows };
}

// Entwurf einmalig aus der Sitzung holen – nur für die Meldung, zu der er gehört
function take(session, submissionId) {
  const d = session && session.factDraft;
  if (!d) return null;
  delete session.factDraft;
  return d.sub === String(submissionId) && d.rows ? d : null;
}

// Werte fürs Formular: abgelehnte Eingabe vor gespeichertem Wert. `value` nur bei abgelehnter Eingabe (roh).
function fields(fact, draftRow) {
  if (draftRow) {
    return {
      rejected: draftRow.reason,
      hint: REASONS[draftRow.reason] || REASONS.invalid,
      value: draftRow.value,
      trust: draftRow.trust,
      evidence_url: draftRow.evidence_url,
      evidence_text: draftRow.evidence_text,
      assessment: draftRow.assessment,
      disputed: draftRow.disputed,
    };
  }
  return {
    rejected: null,
    hint: null,
    trust: fact ? fact.trust_level : 2,
    evidence_url: fact ? fact.evidence_url || '' : '',
    evidence_text: fact ? fact.evidence_text || '' : '',
    assessment: Boolean(fact && fact.editorial_assessment),
    disputed: Boolean(fact && fact.disputed),
  };
}

module.exports = { REASONS, row, build, take, fields };
