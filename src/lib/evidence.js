// Beleg eines Faktenwerts: Fundstelle (Link), Vermerk (Text, z. B. Textausschnitt oder „Telefonat 05.11.“) oder ausdrücklich
// „Einschätzung der Redaktion“ ohne Beleg. Neue oder geänderte Werte der Stufen 1 und 2 brauchen eines davon (Admin, Migration 108).

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

// Fehlt der Beleg? Nur für Werte, die ein Mensch bestätigt (Stufe 1 vom Betreiber, Stufe 2 von uns); nie bei „nein“/0 Punkten
function missing({ trust, url, text, assessment, value, scoring }) {
  return [1, 2].includes(Number(trust)) && needed(value, scoring) && !url && !text && !assessment;
}

module.exports = { kind, needed, missing };
