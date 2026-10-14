// SEO-Hilfen: Länder- und Regionsseiten, beste Reisemonate, strukturierte Daten (JSON-LD). Reine Funktionen.
const COUNTRIES = require('./countries');
const scoring = require('../services/scoring');
const { slugify } = require('./util');

// Länder mit Artikel (für „Triathlon-Hotels in der Türkei“)
const COUNTRY_IN = {
  CH: 'in der Schweiz', TR: 'in der Türkei', US: 'in den USA', NL: 'in den Niederlanden', AE: 'in den Vereinigten Arabischen Emiraten',
  GB: 'im Vereinigten Königreich', CZ: 'in Tschechien', DO: 'in der Dominikanischen Republik',
};

function countryName(code) {
  const hit = COUNTRIES.find((c) => c[0] === code);
  return hit ? hit[1] : code;
}

function countryIn(code) {
  return COUNTRY_IN[code] || `in ${countryName(code)}`;
}

function countrySlug(code) {
  return slugify(countryName(code));
}

function countryFromSlug(slug) {
  const hit = COUNTRIES.find((c) => slugify(c[1]) === slug);
  return hit ? hit[0] : null;
}

function distanceKm(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Liegt ein Objekt in einer Region (Mittelpunkt + Radius)?
function inRegion(entity, region) {
  if (entity.lat === null || entity.lat === undefined || entity.lng === null || entity.lng === undefined) return false;
  const d = distanceKm({ lat: Number(entity.lat), lng: Number(entity.lng) }, { lat: Number(region.lat), lng: Number(region.lng) });
  return d <= Number(region.radius_km);
}

// Klima je Monat über mehrere Objekte mitteln
function averageClimate(rows) {
  const out = [];
  for (let m = 1; m <= 12; m++) {
    const r = rows.filter((x) => Number(x.month) === m);
    const avg = (k) => {
      const v = r.map((x) => x[k]).filter((x) => x !== null && x !== undefined).map(Number);
      return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null;
    };
    if (r.length) out.push({ month: m, avg_high_c: avg('avg_high_c'), avg_low_c: avg('avg_low_c'), rain_days: avg('rain_days') });
  }
  return out;
}

// Beste Reisemonate: alle Klima-Kriterien des Rankings erreichen die volle Punktzahl (keine festen Grenzwerte im Code)
// Beste Reisezeit (nur Information, nicht im Score): Monate, deren Klimawert im Bereich formula.best_time liegt.
// formula.best_time = { metric: 'avg_high_c', min: 16, max: 28 }; ohne Angabe gibt es keine Empfehlung.
function bestMonths(formula, climate) {
  const bt = (formula || {}).best_time;
  if (!bt || !bt.metric) return [];
  return (climate || [])
    .filter((row) => {
      const v = row[bt.metric];
      if (v === null || v === undefined) return false;
      const n = Number(v);
      return (bt.min === undefined || n >= Number(bt.min)) && (bt.max === undefined || n <= Number(bt.max));
    })
    .map((row) => Number(row.month))
    .sort((a, b) => a - b);
}

// Monate zu lesbaren Spannen zusammenfassen: [3,4,5,10] -> "März–Mai, Oktober"
function monthRanges(months, names) {
  const sorted = [...new Set(months)].sort((a, b) => a - b);
  if (sorted.length === 12) return 'ganzjährig';
  const ranges = [];
  for (const m of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && m === last[1] + 1) last[1] = m;
    else ranges.push([m, m]);
  }
  // Spanne über den Jahreswechsel zusammenführen (Dezember + Januar)
  if (ranges.length > 1 && ranges[0][0] === 1 && ranges[ranges.length - 1][1] === 12) {
    const first = ranges.shift();
    ranges[ranges.length - 1][1] = first[1];
  }
  return ranges.map(([a, b]) => (a === b ? names[a - 1] : `${names[a - 1]}–${names[b - 1]}`)).join(', ');
}

// Wie viele Objekte haben welche (filterbare) Leistung? Häufigste zuerst
function featureShares(entities, featureMap, limit = 6) {
  const counts = new Map();
  for (const e of entities) {
    for (const f of featureMap.get(e.id) || []) {
      if (!f.filterable) continue;
      const c = counts.get(f.code) || { label: f.label, n: 0 };
      c.n += 1;
      counts.set(f.code, c);
    }
  }
  return [...counts.values()].sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'de')).slice(0, limit);
}

// ---------- JSON-LD ----------

// Sicher in <script type="application/ld+json"> einbetten
function ldJson(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function websiteLd(site, url) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    url,
    potentialAction: { '@type': 'SearchAction', target: `${url}/?q={search_term_string}#ranking`, 'query-input': 'required name=search_term_string' },
  };
}

function itemListLd(name, items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, url: it.url, name: it.name })),
  };
}

function breadcrumbLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  };
}

// Objekt mit redaktioneller Bewertung (nur wenn ein aussagekräftiger Score vorliegt)
function entityLd({ entity, ranking, site, url, result, image, description, features }) {
  const type = ranking.entity_type === 'hotel' ? 'Hotel' : 'LocalBusiness';
  const ld = {
    '@context': 'https://schema.org',
    '@type': type,
    name: entity.name,
    url,
    address: { '@type': 'PostalAddress', addressLocality: entity.city || undefined, addressCountry: entity.country || undefined },
  };
  if (entity.lat && entity.lng) ld.geo = { '@type': 'GeoCoordinates', latitude: Number(entity.lat), longitude: Number(entity.lng) };
  if (image) ld.image = image;
  if (description) ld.description = description;
  // Ausstattung als schema.org-Merkmale (nur vorhandene Leistungen)
  if (features && features.length) {
    ld.amenityFeature = features.map((f) => ({ '@type': 'LocationFeatureSpecification', name: f.label, value: true }));
  }
  if (result && result.eligible && result.score !== null) {
    ld.review = {
      '@type': 'Review',
      name: `${ranking.score_name} ${result.score}`,
      reviewBody: result.label || undefined,
      author: { '@type': 'Organization', name: site.name },
      publisher: { '@type': 'Organization', name: site.name },
      reviewRating: { '@type': 'Rating', ratingValue: result.score, bestRating: 100, worstRating: 0 },
    };
  }
  return ld;
}

// Link zu den Google-Bewertungen eines Ortes über die offiziellen Maps-URLs (kein Schlüssel, keine Datenübertragung beim Seitenaufruf).
// Mit Place ID exakt, sonst Suche nach Name und Anschrift bzw. Ort.
function googleMapsUrl(entity) {
  const a = (entity.attributes || {}).address || {};
  const query = [entity.name, a.street, a.postal_code, a.city || entity.city, entity.country ? countryName(entity.country) : null].filter(Boolean).join(', ');
  const params = new URLSearchParams({ api: '1', query });
  const placeId = (entity.attributes || {}).google_place_id;
  if (placeId) params.set('query_place_id', placeId);
  return `https://www.google.com/maps/search/?${params}`;
}

// Einbettung (Maps Embed API, Modus „place“): Ort mit Infokarte inkl. Google-Bewertung
function googleMapsEmbedUrl(entity, key) {
  if (!key) return null;
  const placeId = (entity.attributes || {}).google_place_id;
  const a = (entity.attributes || {}).address || {};
  const q = placeId ? `place_id:${placeId}` : [entity.name, a.street, a.postal_code, a.city || entity.city, entity.country ? countryName(entity.country) : null].filter(Boolean).join(', ');
  return `https://www.google.com/maps/embed/v1/place?${new URLSearchParams({ key, q, language: 'de' })}`;
}

// Suchergebnis-Längen: Titel ~60 Zeichen (Marke nur anhängen, wenn sie noch passt), Beschreibung ~155 am Wortende gekürzt
const TITLE_MAX = 60;
const DESC_MAX = 155;

function fitTitle(title, brand) {
  const t = String(title || '').trim();
  const withBrand = brand ? `${t} · ${brand}` : t;
  return withBrand.length <= TITLE_MAX || !brand ? withBrand : t;
}

function fitDescription(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= DESC_MAX) return t;
  const cut = t.slice(0, DESC_MAX - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), DESC_MAX - 30)).replace(/[\s,;:–-]+$/, '')}…`;
}

module.exports = {
  fitTitle,
  fitDescription,
  TITLE_MAX,
  DESC_MAX,
  googleMapsUrl,
  googleMapsEmbedUrl,
  countryName, countryIn, countrySlug, countryFromSlug, distanceKm, inRegion,
  averageClimate, bestMonths, monthRanges, featureShares,
  ldJson, websiteLd, itemListLd, breadcrumbLd, entityLd,
};
