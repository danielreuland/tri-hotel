// Geodaten aus OpenStreetMap: Koordinaten (Nominatim) und Umgebung (Overpass).
// Welche OSM-Objekte für welches Kriterium zählen, steht in criteria.scoring.auto
// (siehe db/migrations/002_*). Hier ist nichts ranking-spezifisch.
const config = require('../config');

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
// Öffentliche Overpass-Server; bei Überlastung (429/504/Timeout) wird der nächste versucht
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(query, { timeoutMs = 45000 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < OVERPASS.length * 2; attempt++) {
    const url = OVERPASS[attempt % OVERPASS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': config.userAgent, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return res.json();
      lastError = new Error(`Overpass ${res.status} (${new URL(url).hostname})`);
      if (![429, 500, 502, 503, 504].includes(res.status)) break;
    } catch (err) {
      lastError = new Error(`Overpass nicht erreichbar (${new URL(url).hostname}): ${err.message}`);
    }
    await sleep(2000 * (attempt + 1));
  }
  throw lastError;
}
// Erlaubt nur Tag-Filter wie ["key"="value"], ["key"!~"a|b"], ["key"]
const SELECTOR_RE = /^(\["[\w:]+"((=|!=|~|!~)"[^"\]]*")?\])+$/;

// Nominatim erlaubt höchstens eine Anfrage pro Sekunde
let lastNominatim = 0;
async function nominatim(params) {
  const wait = lastNominatim + 1100 - Date.now();
  if (wait > 0) await sleep(wait);
  lastNominatim = Date.now();
  const res = await fetch(`${NOMINATIM}?${new URLSearchParams({ format: 'jsonv2', addressdetails: '1', ...params })}`, {
    headers: { 'User-Agent': config.userAgent, 'Accept-Language': 'de' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  return res.json();
}

function hitOf(h) {
  return h && {
    lat: Number(h.lat), lng: Number(h.lon), display: h.display_name, osmUrl: `https://www.openstreetmap.org/${h.osm_type}/${h.osm_id}`,
    category: `${h.category || h.class || ''}=${h.type || ''}`, country: h.address && h.address.country_code ? h.address.country_code.toUpperCase() : null,
    postcode: (h.address && h.address.postcode) || null,
  };
}

async function geocode({ name, city, country }) {
  const params = { q: [name, city].filter(Boolean).join(', '), limit: '1' };
  if (country) params.countrycodes = country.toLowerCase();
  return hitOf((await nominatim(params))[0]) || null;
}

// Website und E-Mail einer Unterkunft aus OpenStreetMap (Tags website/contact:website, email/contact:email),
// nur bei passendem Namen und Unterkunfts-Kategorie. Ergebnis: { website, email, osmUrl, display } oder null
async function findOsmContact({ name, city, country }) {
  const { nameMatch } = require('./places');
  const params = { q: [name, city].filter(Boolean).join(', '), limit: '5', extratags: '1' };
  if (country) params.countrycodes = country.toLowerCase();
  for (const h of await nominatim(params)) {
    const tags = h.extratags || {};
    const lodging = LODGING_CATEGORY.test(`${h.category || h.class || ''}=${h.type || ''}`);
    if (!lodging || !nameMatch(name, h.name || h.display_name)) continue;
    let website = null;
    const site = tags.website || tags['contact:website'] || tags.url;
    try {
      website = site ? new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`).toString() : null;
    } catch { website = null; }
    const mail = String(tags.email || tags['contact:email'] || '').split(';')[0].trim().toLowerCase();
    const email = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(mail) ? mail : null;
    if (!website && !email) continue;
    return { website, email, osmUrl: `https://www.openstreetmap.org/${h.osm_type}/${h.osm_id}`, display: h.display_name };
  }
  return null;
}

async function findWebsite(args) {
  const r = await findOsmContact(args);
  return r && r.website ? r : null;
}

// Photon (Komoot, OSM-Daten): unscharfe Suche nach Unterkünften
async function photon(q, { near, tag = 'tourism' } = {}) {
  const params = new URLSearchParams({ q, limit: '8', lang: 'de' });
  if (near) {
    params.set('lat', String(near.lat));
    params.set('lon', String(near.lng));
  }
  if (tag) params.append('osm_tag', tag);
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { headers: { 'User-Agent': config.userAgent }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Photon ${res.status}`);
  const json = await res.json();
  return (json.features || []).map((f) => ({
    lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0],
    display: [f.properties.name, f.properties.street, f.properties.postcode, f.properties.city || f.properties.town || f.properties.village, f.properties.district].filter(Boolean).join(', '),
    country: f.properties.countrycode ? f.properties.countrycode.toUpperCase() : null,
    postcode: f.properties.postcode || null,
    category: `${f.properties.osm_key}=${f.properties.osm_value}`,
    osmUrl: `https://www.openstreetmap.org/${{ N: 'node', W: 'way', R: 'relation' }[f.properties.osm_type] || 'node'}/${f.properties.osm_id}`,
  }));
}

// Name ohne Gattungsbegriffe und Sterne, z. B. „Playitas Aparthotel ****“ -> „Playitas“
function coreName(name) {
  return String(name || '')
    .replace(/[*★☆]+/g, ' ')
    .replace(/\b(hotel|aparthotel|apart-?hotel|resort|spa|suites?|apartments?|appartements?|boutique|hostal|hostel|pension|gasthof|gasthaus|landhaus|sporthotel|wellnesshotel|hotels?|&|and|und|the|das|der|die|le|la|el|il)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}' -]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const LODGING_CATEGORY = /tourism=(hotel|apartment|guest_house|hostel|motel|chalet|resort)|leisure=resort/;
const MAX_CITY_KM = 40;

// Koordinaten aus mehreren Quellen, je Treffer mit Plausibilitätsprüfung gegen das Ortszentrum.
// candidates: { geo: [{lat,lng,kind,url}], addresses: [{street,postal_code,city,country,url}] }
// Ergebnis: { lat, lng, source, detail, url? } oder null; tried = Protokoll der Versuche
async function locate({ name, city, country }, candidates = {}) {
  const tried = [];
  const cc = country ? country.toUpperCase() : null;
  // Ortszentren: gleichnamige Orte gibt es mehrfach (z. B. zwei „Hopfgarten“ in Tirol) – geprüft wird gegen den nächstgelegenen
  let centers = [];
  if (city) {
    try {
      const params = { city, limit: '5' };
      if (cc) params.countrycodes = cc.toLowerCase();
      centers = (await nominatim(params)).map(hitOf);
      if (!centers.length) centers = (await nominatim({ q: city, limit: '5', ...(cc ? { countrycodes: cc.toLowerCase() } : {}) })).map(hitOf);
    } catch (err) {
      tried.push(`Ortszentrum: ${err.message}`);
    }
  }
  const center = centers[0] || null;
  const nearestCenterKm = (p) => (centers.length ? Math.min(...centers.map((c) => distanceKm(c, p))) : null);
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  // Starke Belege vor der Entfernung: gleiche Postleitzahl (Anschriftssuche) oder Ortsname im Treffer (Namenssuche)
  const plausible = (p, { postalCode } = {}) => {
    if (p.country && cc && p.country !== cc) return `liegt in ${p.country}, nicht in ${cc}`;
    if (postalCode && p.postcode && p.postcode.replace(/\s/g, '') === String(postalCode).replace(/\s/g, '')) return null;
    if (city && norm(p.display).includes(norm(city))) return null;
    const d = nearestCenterKm(p);
    if (d !== null && d > MAX_CITY_KM) return `${Math.round(d)} km vom Ort ${city}`;
    return null;
  };
  const accept = (p, source, detail, opts) => {
    const why = plausible(p, opts);
    if (why) {
      tried.push(`${source}: verworfen (${why})`);
      return null;
    }
    const d = nearestCenterKm(p);
    const dist = d !== null && d <= MAX_CITY_KM ? `, ${d.toFixed(1).replace('.', ',')} km vom Ortszentrum` : '';
    return { lat: p.lat, lng: p.lng, source, detail: `${detail}${dist}`, url: p.url || p.osmUrl || null, tried };
  };

  // 1. Koordinaten direkt von der Website (Strukturdaten, Metatag, Kartenlink)
  for (const g of candidates.geo || []) {
    const r = accept(g, `Website (${g.kind})`, g.url);
    if (r) return r;
  }
  // 2. Anschrift (Strukturdaten der Website oder KI-Auswertung mit Fundstelle):
  //    strukturiert -> Freitext -> Photon -> Straße ohne Hausnummer; die Postleitzahl allein erst ganz am Ende (ungefähr)
  const seenAddr = new Set();
  const postcodeFallbacks = [];
  for (const a of candidates.addresses || []) {
    if (!a.street && !a.text) continue;
    const key = `${a.street || a.text}|${a.postal_code || ''}|${a.city || ''}`.toLowerCase();
    if (seenAddr.has(key)) continue;
    seenAddr.add(key);
    const c = (a.country || cc || '').toLowerCase();
    const label = `${a.street || a.text}${a.postal_code ? `, ${a.postal_code}` : ''}${a.city ? ` ${a.city}` : ''}`;
    const freeText = a.street ? [a.street, [a.postal_code, a.city || city].filter(Boolean).join(' ')].filter(Boolean).join(', ') : a.text;
    const streetOnly = a.street && a.street.replace(/[,\s]*\d+[a-z]?(\s*[-/]\s*\d+[a-z]?)?\s*$/i, '').trim();
    const attempts = [
      a.street && { kind: 'Nominatim', params: { street: a.street, city: a.city || city || '', ...(a.postal_code ? { postalcode: a.postal_code } : {}), limit: '1' } },
      { kind: 'Nominatim', params: { q: freeText, limit: '1' } },
      { kind: 'Photon', q: freeText },
      streetOnly && streetOnly !== a.street && { kind: 'Nominatim', params: { street: streetOnly, city: a.city || city || '', ...(a.postal_code ? { postalcode: a.postal_code } : {}), limit: '1' }, approx: 'Straße ohne Hausnummer' },
    ].filter(Boolean);
    for (const t of attempts) {
      try {
        let hit = null;
        if (t.kind === 'Photon') {
          hit = (await photon(t.q, { near: center, tag: null })).find((h) => !c || !h.country || h.country === c.toUpperCase()) || null;
        } else {
          hit = hitOf((await nominatim({ ...t.params, ...(c ? { countrycodes: c } : {}) }))[0]);
        }
        if (!hit) continue;
        const r = accept(hit, `Anschrift von der Website${t.approx ? ` (${t.approx})` : ''}`, `${label} → ${hit.display}`, { postalCode: a.postal_code });
        if (r) return r;
      } catch (err) {
        tried.push(`Anschrift (${t.kind}): ${err.message}`);
      }
    }
    tried.push(`Anschrift „${label}“: nicht genau gefunden`);
    if (a.postal_code) postcodeFallbacks.push({ ...a, c, label });
  }
  // 3. Name + Ort, dann Kernname (ohne „Hotel“, Sterne …), jeweils Nominatim und Photon (nur Unterkünfte)
  const core = coreName(name);
  const queries = [...new Set([[name, city].filter(Boolean).join(', '), core && city ? `${core}, ${city}` : null, core || null].filter(Boolean))];
  for (const q of queries) {
    try {
      const hit = hitOf((await nominatim({ q, limit: '1', ...(cc ? { countrycodes: cc.toLowerCase() } : {}) }))[0]);
      if (hit) {
        const r = accept(hit, 'Namenssuche (Nominatim)', `„${q}“ → ${hit.display}`);
        if (r) return r;
      } else tried.push(`Nominatim „${q}“: nichts gefunden`);
    } catch (err) {
      tried.push(`Nominatim „${q}“: ${err.message}`);
    }
    try {
      const hits = (await photon(q, { near: center })).filter((h) => LODGING_CATEGORY.test(h.category));
      if (!hits.length) tried.push(`Photon „${q}“: keine Unterkunft gefunden`);
      for (const h of hits.slice(0, 3)) {
        const r = accept(h, 'Namenssuche (Photon)', `„${q}“ → ${h.display}`);
        if (r) return r;
      }
    } catch (err) {
      tried.push(`Photon „${q}“: ${err.message}`);
    }
  }
  // 4. Letzte Stufe: Mitte des Postleitzahlgebiets der Website-Anschrift (ungefähr – bitte im Admin prüfen)
  for (const a of postcodeFallbacks) {
    try {
      const hit = hitOf((await nominatim({ postalcode: a.postal_code, ...(a.city ? { city: a.city } : {}), ...(a.c ? { countrycodes: a.c } : {}), limit: '1' }))[0]);
      if (!hit) continue;
      const r = accept({ ...hit, postcode: hit.postcode || a.postal_code }, 'Postleitzahlgebiet der Anschrift (ungefähr – bitte prüfen)', `${a.label} → ${hit.display}`, { postalCode: a.postal_code });
      if (r) return { ...r, approximate: true };
    } catch (err) {
      tried.push(`Postleitzahl: ${err.message}`);
    }
  }
  return { lat: null, lng: null, tried };
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
  const { elements = [] } = await overpass(body);
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

// ---------- Weitere Quellen für auto-Regeln ----------

// Längste Ausdehnung einer Fläche in Metern (größter Abstand zweier Eckpunkte; bei Becken ≈ Diagonale)
function spanM(geometry) {
  const pts = (geometry || []).filter((g) => g && g.lat !== undefined && g.lon !== undefined);
  let best = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      best = Math.max(best, distanceKm({ lat: pts[i].lat, lng: pts[i].lon }, { lat: pts[j].lat, lng: pts[j].lon }) * 1000);
    }
  }
  return best;
}

// Beckenlänge aus OSM: Tag length (z. B. "50" oder "50 m"), sonst aus der Geometrie. Diagonale eines 50×25-m-Beckens ≈ 56 m,
// eines 25×12,5-m-Beckens ≈ 28 m – daher Länge ≈ Diagonale × 0,9 (konservativ).
function poolLengthM(el) {
  const tag = String((el.tags || {}).length || (el.tags || {})['swimming_pool:length'] || '').replace(',', '.');
  const n = parseFloat(tag);
  if (Number.isFinite(n) && n > 5 && n < 200) return { lengthM: Math.round(n), from: 'tag' };
  const span = spanM(el.geometry);
  return span ? { lengthM: Math.round(span * 0.9), from: 'geometry' } : null;
}

// Becken mit Länge im Radius: Overpass mit Geometrie, je Becken Entfernung und Länge
async function poolsWithLength(point, selectors, radiusKm) {
  const valid = selectors.filter((s) => SELECTOR_RE.test(s));
  if (!valid.length) return [];
  const m = Math.round(radiusKm * 1000);
  const body = `[out:json][timeout:25];(${valid.map((s) => `way${s}(around:${m},${point.lat},${point.lng});`).join('')});out geom 200;`;
  const { elements = [] } = await overpass(body);
  return elements.map((el) => {
    const len = poolLengthM(el);
    const c = (el.geometry || [])[0];
    if (!len || !c) return null;
    return { distanceKm: Math.round(distanceKm(point, { lat: c.lat, lng: c.lon }) * 10) / 10, lengthM: len.lengthM, from: len.from,
      name: (el.tags || {}).name || null, url: `https://www.openstreetmap.org/${el.type}/${el.id}` };
  }).filter(Boolean);
}

// length_options: [{min_m, option}] – bestes Becken (längste passende Klasse, dann das nächste)
function applyLengthRule(auto, pools) {
  for (const o of auto.length_options || []) {
    const hits = pools.filter((p) => p.lengthM >= o.min_m).sort((a, b) => a.distanceKm - b.distanceKm);
    if (hits.length) return { value: { option: o.option }, hit: hits[0] };
  }
  return null;
}

// EU-Badegewässer (EEA, amtliche Badestellen mit Qualitätsklasse) – nächste Stelle im Radius
const EEA_BATHING = 'https://water.discomap.eea.europa.eu/arcgis/rest/services/BathingWater/BathingWater_Dyna_WM_2025/MapServer/3/query';
const QUALITY = { Excellent: 'ausgezeichnet', Good: 'gut', Sufficient: 'ausreichend', Poor: 'mangelhaft' };
async function bathingWaters(point, radiusKm) {
  const params = new URLSearchParams({
    geometry: `${point.lng},${point.lat}`, geometryType: 'esriGeometryPoint', inSR: '4326', distance: String(Math.round(radiusKm * 1000)),
    units: 'esriSRUnit_Meter', outFields: 'bathingWaterName,bwWaterCategory,qualityStatus,bwProfileLink,latitude,longitude', returnGeometry: 'false', f: 'json',
  });
  const res = await fetch(`${EEA_BATHING}?${params}`, { headers: { 'User-Agent': config.userAgent }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`EEA ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`EEA: ${data.error.message || 'Fehler'}`);
  return (data.features || []).map((f) => f.attributes).filter((a) => a && a.latitude && a.longitude).map((a) => ({
    distanceKm: Math.round(distanceKm(point, { lat: a.latitude, lng: a.longitude }) * 10) / 10,
    name: a.bathingWaterName, category: a.bwWaterCategory, quality: a.qualityStatus, qualityText: QUALITY[a.qualityStatus] || a.qualityStatus || 'nicht eingestuft',
    url: a.bwProfileLink || 'https://www.eea.europa.eu/en/topics/in-depth/bathing-water',
  })).sort((a, b) => a.distanceKm - b.distanceKm);
}

// Gelände: Höhen auf einem Raster um den Punkt (OpenTopoData, Datensatz mapzen, eine Anfrage je Objekt)
const TOPO = 'https://api.opentopodata.org/v1/mapzen';
async function terrain(point, radiusKm, { steps = 3 } = {}) {
  const pts = [];
  // steps 3 = 7×7 Raster im Quadrat (4 = 9×9), nur Punkte im Kreis; höchstens 100 Punkte je Anfrage
  for (let i = -steps; i <= steps; i++) {
    for (let j = -steps; j <= steps; j++) {
      const dLat = (i / steps) * (radiusKm / 111.32);
      const dLng = (j / steps) * (radiusKm / (111.32 * Math.cos((point.lat * Math.PI) / 180)));
      const p = { lat: point.lat + dLat, lng: point.lng + dLng };
      if (distanceKm(point, p) <= radiusKm + 0.01) pts.push({ ...p, i, j });
    }
  }
  const res = await fetch(`${TOPO}?locations=${pts.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')}`,
    { headers: { 'User-Agent': config.userAgent }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`OpenTopoData ${res.status}`);
  const data = await res.json();
  const elev = (data.results || []).map((r) => r.elevation).filter((e) => typeof e === 'number');
  // Meer (≤ 0 m) zählt nicht als Gelände
  const land = elev.filter((e) => e > 0);
  if (land.length < 5) return null;
  const center = (data.results || []).find((r) => Math.abs(r.location.lat - point.lat) < 1e-4 && Math.abs(r.location.lng - point.lng) < 1e-4);
  return { radiusKm, points: land.length, minM: Math.round(Math.min(...land)), maxM: Math.round(Math.max(...land)),
    reliefM: Math.round(Math.max(...land) - Math.min(...land)), centerM: center ? Math.round(center.elevation) : null, elevations: land.map(Math.round),
    // Raster mit Lage (i, j) für Nachbarvergleiche; Meer bleibt als null erhalten
    grid: pts.map((p, k) => ({ i: p.i, j: p.j, e: typeof (data.results || [])[k]?.elevation === 'number' && data.results[k].elevation > 0 ? Math.round(data.results[k].elevation) : null })) };
}

// terrain-Regel: relief_max_m (≤ → true) bzw. relief_min_m (≥ → true); sonst kein Vorschlag (eine flache Runde kann es
// auch in hügeligem Gelände geben). info_only: nur Kennzahlen anzeigen (z. B. für Admin-Einstufungen)
function applyTerrainRule(auto, t) {
  if (!t || auto.info_only) return null;
  if (auto.relief_max_m !== undefined && t.reliefM <= auto.relief_max_m) return { bool: true };
  if (auto.relief_min_m !== undefined && t.reliefM >= auto.relief_min_m) return { bool: true };
  return null;
}

const terrainText = (t) => `Höhen im Umkreis von ${t.radiusKm} km: ${t.minM}–${t.maxM} m (Unterschied ${t.reliefM} m${t.centerM !== null ? `, am Objekt ${t.centerM} m` : ''}), OpenTopoData/Mapzen, ${t.points} Messpunkte.`;

// Eine Regel auswerten. Ergebnis: { value?, evidenceUrl, evidenceText, info? } oder null
async function evaluateRule(point, auto, ctx = {}) {
  if (auto.source === 'bike_area') return require('./bike-area').evaluate(point, auto, ctx);
  if (auto.source === 'osm') {
    if (auto.length_options) {
      const pools = await poolsWithLength(point, auto.selectors || [], auto.radius_km || 5);
      const r = applyLengthRule(auto, pools);
      if (!r) return null;
      return { value: r.value, evidenceUrl: r.hit.url,
        evidenceText: [auto.note, `${r.hit.name || 'Becken ohne Namen'}, ca. ${r.hit.lengthM} m lang (${r.hit.from === 'tag' ? 'Angabe in OSM' : 'aus der Kartengeometrie gemessen'}), ${r.hit.distanceKm} km Luftlinie.`].filter(Boolean).join(' ') };
    }
    const hit = await nearest(point, auto.selectors || [], auto.radius_km || 5);
    const value = applyRule(auto, hit);
    if (!value) return null;
    const found = hit ? `Nächster Treffer: ${hit.name || 'ohne Namen'}, ${hit.distanceKm} km Luftlinie.` : `Kein Treffer im Umkreis von ${auto.radius_km} km.`;
    return { value, evidenceUrl: hit ? hit.url : 'https://www.openstreetmap.org', evidenceText: [auto.note, found].filter(Boolean).join(' ') };
  }
  if (auto.source === 'eea_bathing') {
    const list = await bathingWaters(point, auto.radius_km || 5);
    const ok = list.filter((b) => !(auto.exclude_quality || ['Poor']).includes(b.quality));
    const hit = ok[0];
    if (!hit) return null; // EEA deckt nur EU-Badestellen ab – kein Treffer ist kein „nein“
    const value = applyRule({ options: auto.options, if_unmatched: auto.if_unmatched }, hit);
    if (!value) return null;
    return { value, evidenceUrl: hit.url,
      evidenceText: [auto.note, `Amtliche Badestelle „${hit.name}“ (${hit.category === 'Lake' ? 'See' : hit.category === 'River' ? 'Fluss' : hit.category === 'Coastal' ? 'Küste' : hit.category}), Wasserqualität ${hit.qualityText}, ${hit.distanceKm} km Luftlinie (EEA).`].filter(Boolean).join(' ') };
  }
  if (auto.source === 'terrain') {
    const full = await terrain(point, auto.radius_km || 2);
    if (!full) return null;
    const { elevations, ...t } = full; // Rohwerte nicht speichern
    const value = applyTerrainRule(auto, t);
    const text = [auto.note, terrainText(t)].filter(Boolean).join(' ');
    return value ? { value, evidenceUrl: 'https://www.opentopodata.org', evidenceText: text, info: t } : { info: t, infoText: text };
  }
  return null;
}

// Ermittelt Vorschläge für alle Kriterien mit auto-Regel. auto kann eine Regel oder eine Liste sein (erste mit Ergebnis zählt).
// Ergebnis: [{criterionId, value, evidenceUrl, evidenceText}] und je Kriterium Kennzahlen ohne Wert in .infos
async function suggestFacts(point, criteria, ctx = {}) {
  const out = [];
  out.infos = {};
  for (const c of criteria) {
    const auto = c.scoring && c.scoring.auto;
    if (!auto) continue;
    for (const rule of [].concat(auto)) {
      let r = null;
      try {
        r = await evaluateRule(point, rule, ctx);
      } catch (err) {
        console.error('[geo]', c.code, rule.source, err.message);
      }
      if (r && r.info) out.infos[c.code] = { ...r.info, text: r.infoText || r.evidenceText };
      if (r && r.value) {
        out.push({ criterionId: c.id, value: r.value, evidenceUrl: r.evidenceUrl, evidenceText: r.evidenceText });
        break;
      }
      await new Promise((res) => setTimeout(res, 1000)); // externe Dienste schonen
    }
  }
  return out;
}

module.exports = {
  locate,
  coreName, geocode, findWebsite, findOsmContact, nearest, applyRule, applyLengthRule, applyTerrainRule, poolLengthM, spanM,
  bathingWaters, terrain, evaluateRule, distanceKm, suggestFacts, overpass, SELECTOR_RE };
