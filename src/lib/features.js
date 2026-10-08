// Leistungen (einheitlicher Katalog je Objekttyp) und Suchfilter. Reine Funktionen, ohne DB.

// Passt ein Faktenwert zu den Werten einer Ableitungsregel? {"option":"x"} / {"bool":true}
function valueMatches(value, values) {
  if (!value || !Array.isArray(values)) return false;
  if (value.option !== undefined) return values.includes(value.option);
  if (typeof value.bool === 'boolean') return values.includes(value.bool);
  return false;
}

// Leistungen eines Objekts.
// catalog: aktive Katalog-Einträge; facts: [{ ranking_code, criterion_code, value, trust_level, checked_at }]
// manual: [{ feature_id, source, trust_level, evidence_url, checked_at }] (nur für Leistungen ohne Ableitung)
// Ergebnis: vorhandene Leistungen in Katalog-Reihenfolge mit Herkunft
function entityFeatures(catalog, facts, manual) {
  const factMap = new Map((facts || []).map((f) => [`${f.ranking_code}:${f.criterion_code}`, f]));
  const manualMap = new Map((manual || []).map((m) => [m.feature_id, m]));
  const out = [];
  for (const feat of [...catalog].sort((a, b) => a.sort_order - b.sort_order)) {
    if (feat.active === false) continue;
    if (feat.derive) {
      const f = factMap.get(`${feat.derive.ranking}:${feat.derive.criterion}`);
      if (f && valueMatches(f.value, feat.derive.values)) {
        out.push({ ...feat, derived: true, trust_level: f.trust_level, checked_at: f.checked_at });
      }
    } else if (manualMap.has(feat.id)) {
      const m = manualMap.get(feat.id);
      out.push({ ...feat, derived: false, trust_level: m.trust_level, source: m.source, evidence_url: m.evidence_url, checked_at: m.checked_at });
    }
  }
  return out;
}

// Gruppiert eine Leistungsliste nach group_label (Reihenfolge wie im Katalog)
function groupFeatures(list) {
  const groups = [];
  for (const f of list) {
    let g = groups.find((x) => x.label === f.group_label);
    if (!g) groups.push((g = { label: f.group_label, items: [] }));
    g.items.push(f);
  }
  return groups;
}

// Suchparameter aus der URL lesen und begrenzen
function parseSearch(query, { countries = [], featureCodes = [] } = {}) {
  const q = String(query.q || '').trim().slice(0, 80);
  const country = countries.includes(String(query.land || '').toUpperCase()) ? String(query.land).toUpperCase() : null;
  const min = Number(query.min);
  const minScore = Number.isFinite(min) && min > 0 && min <= 100 ? Math.round(min) : null;
  const wanted = [].concat(query.l || []).map(String).filter((c) => featureCodes.includes(c));
  return { q, country, minScore, features: [...new Set(wanted)] };
}

function isActive(search) {
  return Boolean(search.q || search.country || search.minScore || search.features.length);
}

function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

// Filtert eine Liste von Objekten. featureSets: Map(entityId -> Set(feature codes))
// Sortierung bleibt unverändert (nur nach Score – Neutralität).
function applySearch(list, search, featureSets) {
  const q = normalize(search.q);
  return list.filter((e) => {
    if (q && !normalize(`${e.name} ${e.city || ''}`).includes(q)) return false;
    if (search.country && e.country !== search.country) return false;
    if (search.minScore && !(e.score >= search.minScore)) return false;
    if (search.features.length) {
      const have = featureSets.get(e.id) || new Set();
      if (!search.features.every((c) => have.has(c))) return false;
    }
    return true;
  });
}

module.exports = { valueMatches, entityFeatures, groupFeatures, parseSearch, isActive, applySearch };
