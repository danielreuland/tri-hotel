// Leistungen (einheitlicher Katalog je Objekttyp) und Suchfilter. Reine Funktionen, ohne DB.

// Passt ein Faktenwert zu den Werten einer Ableitungsregel? {"option":"x"} / {"options":[…]} / {"bool":true}
function valueMatches(value, values) {
  if (!value || !Array.isArray(values)) return false;
  if (Array.isArray(value.options)) return value.options.some((o) => values.includes(o));
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

// Leistungen aus derselben Angabe (gleiches Kriterium, z. B. verschiedene Beckenlängen) sind Alternativen:
// ein Objekt hat dort meist nur die beste Angabe. Schlüssel je Leistung: 'ranking:kriterium' bzw. der eigene Code.
function alternativeGroups(catalog) {
  return new Map((catalog || []).map((f) => [f.code, f.derive ? `${f.derive.ranking}:${f.derive.criterion}` : f.code]));
}

// Filtert eine Liste von Objekten. featureSets: Map(entityId -> Set(feature codes)); groups: alternativeGroups(catalog).
// Gewählte Leistungen derselben Gruppe sind „oder“-verknüpft, verschiedene Gruppen „und“.
// Sortierung bleibt unverändert (nur nach Score – Neutralität).
function applySearch(list, search, featureSets, groups = new Map()) {
  const q = normalize(search.q);
  const wanted = new Map();
  for (const c of search.features) {
    const key = groups.get(c) || c;
    wanted.set(key, [...(wanted.get(key) || []), c]);
  }
  return list.filter((e) => {
    if (q && !normalize(`${e.name} ${e.city || ''}`).includes(q)) return false;
    if (search.country && e.country !== search.country) return false;
    if (search.minScore && !(e.score >= search.minScore)) return false;
    if (wanted.size) {
      const have = featureSets.get(e.id) || new Set();
      if (![...wanted.values()].every((codes) => codes.some((c) => have.has(c)))) return false;
    }
    return true;
  });
}

module.exports = { valueMatches, entityFeatures, groupFeatures, parseSearch, isActive, alternativeGroups, applySearch };
