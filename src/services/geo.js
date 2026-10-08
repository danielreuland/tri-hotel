// Geodaten aus OpenStreetMap: Koordinaten (Nominatim) und Umgebung (Overpass).
// Welche OSM-Objekte für welches Kriterium zählen, steht in criteria.scoring.auto
// (siehe db/migrations/002_*). Hier ist nichts ranking-spezifisch.
const config = require('../config');

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
// Erlaubt nur Tag-Filter wie ["key"="value"], ["key"!~"a|b"], ["key"]
const SELECTOR_RE = /^(\["[\w:]+"((=|!=|~|!~)"[^"\]]*")?\])+$/;

async function geocode({ name, city, country }) {
  const params = new URLSearchParams({ q: [name, city].filter(Boolean).join(', '), format: 'jsonv2', limit: '1' });
  if (country) params.set('countrycodes', country.toLowerCase());
  const res = await fetch(`${NOMINATIM}?${params}`, {
    headers: { 'User-Agent': config.userAgent, 'Accept-Language': 'de' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const [hit] = await res.json();
  if (!hit) return null;
  return { lat: Number(hit.lat), lng: Number(hit.lon), display: hit.display_name, osmUrl: `https://www.openstreetmap.org/${hit.osm_type}/${hit.osm_id}` };
}

function distanceKm(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Nächstgelegenes OSM-Objekt für eine Liste von Selektoren im Radius.
async function nearest(point, selectors, radiusKm) {
  const valid = selectors.filter((s) => SELECTOR_RE.test(s));
  if (!valid.length) return null;
  const m = Math.round(radiusKm * 1000);
  const body = `[out:json][timeout:25];(${valid.map((s) => `nwr${s}(around:${m},${point.lat},${point.lng});`).join('')});out center 100;`;
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'User-Agent': config.userAgent, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(body)}`,
    signal: AbortSignal.timeout(40000),
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);
  const { elements = [] } = await res.json();
  let best = null;
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat === undefined || lng === undefined) continue;
    const d = distanceKm(point, { lat, lng });
    if (!best || d < best.distanceKm) {
      best = { distanceKm: Math.round(d * 10) / 10, name: el.tags?.name || null, url: `https://www.openstreetmap.org/${el.type}/${el.id}` };
    }
  }
  return best;
}

// Wendet eine auto-Regel auf das gefundene Objekt an. Ergebnis: Wert-JSON oder null.
function applyRule(auto, hit) {
  if (auto.bool_within_km !== undefined) return { bool: Boolean(hit && hit.distanceKm <= auto.bool_within_km) };
  if (!hit) return auto.if_missing ? { option: auto.if_missing } : null;
  for (const o of auto.options || []) {
    if (hit.distanceKm <= o.within_km) return { option: o.option };
  }
  return auto.if_unmatched ? { option: auto.if_unmatched } : null;
}

// Ermittelt Vorschläge für alle Kriterien mit "auto.source = osm".
async function suggestFacts(point, criteria) {
  const out = [];
  for (const c of criteria) {
    const auto = c.scoring && c.scoring.auto;
    if (!auto || auto.source !== 'osm') continue;
    const hit = await nearest(point, auto.selectors || [], auto.radius_km || 5);
    const value = applyRule(auto, hit);
    if (!value) continue;
    const found = hit ? `Nächster Treffer: ${hit.name || 'ohne Namen'}, ${hit.distanceKm} km Luftlinie.` : `Kein Treffer im Umkreis von ${auto.radius_km} km.`;
    out.push({
      criterionId: c.id,
      value,
      evidenceUrl: hit ? hit.url : 'https://www.openstreetmap.org',
      evidenceText: [auto.note, found].filter(Boolean).join(' '),
    });
    await new Promise((r) => setTimeout(r, 1000)); // Overpass schonen
  }
  return out;
}

module.exports = { geocode, nearest, applyRule, distanceKm, suggestFacts, SELECTOR_RE };
