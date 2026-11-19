// Herkunft eines Faktenwerts in Worten (öffentliche Seiten): Hotelseite, Ratgeber-Liste.
// Die Fundstelle als Link folgt in der Vorlage dahinter.
function trustText(fact, ranking) {
  switch (fact.trust_level) {
    case 1: return `vom ${ranking.entity_label_sg} bestätigt`;
    case 2: {
      const day = new Date(fact.checked_at).toLocaleDateString('de-DE');
      // ohne Beleg ausdrücklich als Urteil kennzeichnen; ein Vermerk (z. B. Telefonat) wird nicht veröffentlicht
      if (fact.editorial_assessment && !fact.evidence_url && !fact.evidence_text) return `Einschätzung der Redaktion, Stand ${day}`;
      return `geprüft am ${day}${!fact.evidence_url && fact.evidence_text ? ' · Beleg liegt uns vor' : ''}`;
    }
    case 3: return 'von Nutzern bestätigt';
    default: return 'automatisch ermittelt';
  }
}

module.exports = { trustText };
