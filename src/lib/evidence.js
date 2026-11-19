// Beleg eines Faktenwerts: Fundstelle (Link), Vermerk (Text, z. B. Textausschnitt oder „Telefonat 05.11.“) oder ausdrücklich
// „Einschätzung der Redaktion“ ohne Beleg. Neue oder geänderte Werte der Stufe 2 brauchen eines davon (Admin, Migration 108).
// Stufe 1 („vom Betreiber bestätigt“) braucht keinen: Die Bestätigung des Betreibers ist selbst die Quelle, oft per E-Mail
// ohne Link (Daniel, 19.11.). Ein Vermerk wie „E-Mail vom 18.11.“ bleibt möglich.

// Art des Belegs: 'link' | 'note' | 'assessment' | 'none'
function kind({ evidence_url: url, evidence_text: text, editorial_assessment: assessment } = {}) {
  if (url) return 'link';
  if (text) return 'note';
  if (assessment) return 'assessment';
  return 'none';
}

// „nein“ oder eine Auswahl mit 0 Punkten (z. B. „keine“) heißt: Die Leistung gibt es nicht – dafür gibt es nichts
// zu belegen (Daniel, 09.11.). Bei Mehrfachauswahl nur, wenn alle gewählten Ausprägungen 0 Punkte haben.
function needed(value, scoring) {
  if (!value) return true;
  if (value.bool === false) return false;
  const chosen = Array.isArray(value.options) ? value.options : value.option !== undefined ? [value.option] : [];
  const points = (scoring && scoring.type === 'option' && scoring.points) || null;
  if (points && chosen.length && chosen.every((k) => Number(points[k]) === 0)) return false;
  return true;
}

// Fehlt der Beleg? Nur für Werte, die wir selbst prüfen (Stufe 2); nie bei „nein“/0 Punkten
function missing({ trust, url, text, assessment, value, scoring }) {
  return Number(trust) === 2 && needed(value, scoring) && !url && !text && !assessment;
}

module.exports = { kind, needed, missing };
