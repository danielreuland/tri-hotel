// Beleg eines Faktenwerts: Fundstelle (Link), Vermerk (Text, z. B. Textausschnitt oder „Telefonat 05.11.“) oder ausdrücklich
// „Einschätzung der Redaktion“ ohne Beleg. Neue oder geänderte Werte der Stufen 1 und 2 brauchen eines davon (Admin, Migration 108).

// Art des Belegs: 'link' | 'note' | 'assessment' | 'none'
function kind({ evidence_url: url, evidence_text: text, editorial_assessment: assessment } = {}) {
  if (url) return 'link';
  if (text) return 'note';
  if (assessment) return 'assessment';
  return 'none';
}

// „nein“ heißt: Die Leistung gibt es nicht – dafür gibt es nichts zu belegen (Daniel, 09.11.)
function needed(value) {
  return !(value && value.bool === false);
}

// Fehlt der Beleg? Nur für Werte, die ein Mensch bestätigt (Stufe 1 vom Betreiber, Stufe 2 von uns); nie bei „nein“
function missing({ trust, url, text, assessment, value }) {
  return [1, 2].includes(Number(trust)) && needed(value) && !url && !text && !assessment;
}

module.exports = { kind, needed, missing };
