// Strukturierte Angaben aus dem HTML einer Seite – ohne KI, mit Fundstelle:
// JSON-LD (schema.org Hotel/LocalBusiness: Adresse, Koordinaten, E-Mail, Ausstattung),
// Geo-Metatags und Kartenlinks/-einbettungen (Google Maps, OpenStreetMap).
// Nichts hier ist ranking-spezifisch.

const PLACE_TYPES = /^(Hotel|Resort|LodgingBusiness|BedAndBreakfast|Hostel|Motel|Campground|VacationRental|SportsActivityLocation|HealthClub|ExerciseGym|LocalBusiness|Organization|Place|TouristAccommodation)$/i;
const LODGING_TYPES = /^(Hotel|Resort|LodgingBusiness|BedAndBreakfast|Hostel|Motel|VacationRental)$/i;

function validLatLng(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0)
    ? { lat: a, lng: b } : null;
}

function decodeEntities(s) {
  return String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'");
}

// Alle JSON-LD-Knoten (auch in @graph und Arrays)
function jsonLdNodes(html) {
  const out = [];
  const walk = (n) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!n || typeof n !== 'object') return;
    out.push(n);
    if (n['@graph']) walk(n['@graph']);
  };
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      walk(JSON.parse(m[1].trim().replace(/^<!--|-->$/g, '')));
    } catch { /* fehlerhaftes JSON-LD überspringen */ }
  }
  return out;
}

function typesOf(n) {
  return [].concat(n['@type'] || []).map(String);
}

function textOf(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return String(v.name || v['@value'] || '');
  return String(v);
}

function addressOf(a) {
  if (!a) return null;
  if (Array.isArray(a)) return addressOf(a[0]);
  if (typeof a === 'string') return a.trim() ? { text: a.trim() } : null;
  const country = textOf(a.addressCountry).trim();
  const addr = {
    street: textOf(a.streetAddress).trim() || null,
    postal_code: textOf(a.postalCode).trim() || null,
    city: textOf(a.addressLocality).trim() || null,
    region: textOf(a.addressRegion).trim() || null,
    country: /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : null,
  };
  return addr.street || addr.city ? addr : null;
}

// Koordinaten aus Kartenlinks und eingebetteten Karten
const MAP_PATTERNS = [
  /google\.[a-z.]+\/maps[^"'\s<>]*?@(-?\d{1,2}\.\d{3,}),(-?\d{1,3}\.\d{3,})/gi,
  /google\.[a-z.]+\/maps[^"'\s<>]*?[?&](?:q|ll|query|daddr|destination|center|sll)=(-?\d{1,2}\.\d{3,})(?:,|%2C)\s*(-?\d{1,3}\.\d{3,})/gi,
  /maps\.google\.[a-z.]+\/[^"'\s<>]*?[?&](?:q|ll|daddr|sll)=(-?\d{1,2}\.\d{3,})(?:,|%2C)\s*(-?\d{1,3}\.\d{3,})/gi,
  /openstreetmap\.org\/[^"'\s<>]*?mlat=(-?\d{1,2}\.\d{3,})&(?:amp;)?mlon=(-?\d{1,3}\.\d{3,})/gi,
];
// Eingebettete Google-Karte: …!2d<lng>!3d<lat>…
const EMBED_PATTERN = /google\.[a-z.]+\/maps\/embed[^"'\s<>]*?!2d(-?\d{1,3}\.\d{3,})!3d(-?\d{1,2}\.\d{3,})/gi;

function mapCoordinates(html) {
  const s = decodeEntities(html);
  const found = [];
  for (const re of MAP_PATTERNS) {
    for (const m of s.matchAll(re)) {
      const p = validLatLng(m[1], m[2]);
      if (p) found.push({ ...p, kind: 'Kartenlink' });
    }
  }
  for (const m of s.matchAll(EMBED_PATTERN)) {
    const p = validLatLng(m[2], m[1]);
    if (p) found.push({ ...p, kind: 'eingebettete Karte' });
  }
  return found;
}

function metaCoordinates(html) {
  const meta = (name) => {
    const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["']${name}["']`, 'i');
    const m = re.exec(html);
    return m ? (m[1] || m[2]) : null;
  };
  const pos = meta('geo\\.position') || meta('ICBM');
  if (pos) {
    const [lat, lng] = pos.split(/[;,]\s*/);
    const p = validLatLng(lat, lng);
    if (p) return p;
  }
  return validLatLng(meta('place:location:latitude'), meta('place:location:longitude'))
    || validLatLng(meta('og:latitude'), meta('og:longitude'));
}

// Ergebnis je Seite: { geo: [{lat,lng,kind}], addresses: [...], emails: [...], amenities: [...], names: [...] }
function fromHtml(html) {
  const out = { geo: [], addresses: [], emails: [], amenities: [], names: [] };
  if (!html) return out;
  const nodes = jsonLdNodes(html).filter((n) => typesOf(n).some((t) => PLACE_TYPES.test(t)));
  // Unterkünfte zuerst, dann allgemeine Organisationen/Orte
  nodes.sort((a, b) => Number(typesOf(b).some((t) => LODGING_TYPES.test(t))) - Number(typesOf(a).some((t) => LODGING_TYPES.test(t))));
  for (const n of nodes) {
    const g = n.geo || (n.location && n.location.geo);
    const p = g && validLatLng(g.latitude, g.longitude);
    if (p) out.geo.push({ ...p, kind: 'Strukturdaten' });
    const addr = addressOf(n.address || (n.location && n.location.address));
    if (addr) out.addresses.push(addr);
    const email = textOf(n.email).replace(/^mailto:/i, '').trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email)) out.emails.push(email);
    if (n.name) out.names.push(textOf(n.name).trim());
    for (const f of [].concat(n.amenityFeature || [])) {
      if (f && f.value !== false && f.value !== 'false' && textOf(f.name).trim()) out.amenities.push(textOf(f.name).trim());
    }
  }
  const meta = metaCoordinates(html);
  if (meta) out.geo.push({ ...meta, kind: 'Geo-Metatag' });
  out.geo.push(...mapCoordinates(html));
  return out;
}

// Seiten zusammenführen, je Angabe mit Fundstelle (URL der Seite)
function merge(pages) {
  const out = { geo: [], addresses: [], emails: [], amenities: [] };
  const seen = new Set();
  for (const p of pages) {
    const d = p.data || {};
    for (const g of d.geo || []) {
      const key = `${g.lat.toFixed(4)},${g.lng.toFixed(4)}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.geo.push({ ...g, url: p.url });
      }
    }
    for (const a of d.addresses || []) out.addresses.push({ ...a, url: p.url });
    for (const e of d.emails || []) if (!out.emails.some((x) => x.email === e)) out.emails.push({ email: e, url: p.url });
    for (const a of d.amenities || []) if (!out.amenities.some((x) => x.name === a)) out.amenities.push({ name: a, url: p.url });
  }
  return out;
}

module.exports = { fromHtml, merge, jsonLdNodes, mapCoordinates, metaCoordinates, addressOf, validLatLng };
