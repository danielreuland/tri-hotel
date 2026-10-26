// Google Place ID per Places API (New), Text Search. Gespeichert wird nur die Place ID
// (laut Google-Bedingungen dauerhaft speicherbar); Namen, Adressen und Koordinaten von Google werden nur angezeigt
// bzw. im Speicher zum Abgleich genutzt, nie gespeichert.
// Automatisch übernommen wird eine ID nur bei eindeutigem Treffer (identify/saveAuto), sonst entscheidet der Admin.
const db = require('../db');
const config = require('../config');
const { distanceKm } = require('./geo');
const { countryName } = require('../lib/seo');

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const FIELDS = 'places.id,places.displayName,places.formattedAddress,places.location,places.addressComponents';
const MAX_DISTANCE_M = 150; // eindeutiger Treffer: so nah an unseren Koordinaten
const STOPWORDS = new Set(['hotel', 'hotels', 'resort', 'the', 'and', 'und', 'by', 'de', 'la', 'el', 'los', 'las', 'le', 'der', 'die', 'das', 'am', 'an', 'im', 'in', 'zum', 'zur', 'y', 'e', 'et', '&', '-']);

const enabled = () => Boolean(config.googlePlacesKey);

// Bedeutsame Wörter eines Namens (ohne Akzente, Satzzeichen und Allerweltswörter wie „Hotel“)
function tokens(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ')
    .split(' ').filter((t) => t && !STOPWORDS.has(t));
}

// 2 = gleiche Wörter, 1 = Teilübereinstimmung (mind. die Hälfte unserer Wörter), 0 = passt nicht
function nameMatch(ours, theirs) {
  const a = new Set(tokens(ours));
  const b = new Set(tokens(theirs));
  if (!a.size || !b.size) return 0;
  // gleiche Wörter, nur anders zusammengeschrieben („SantaLucia“)
  if ([...a].join('') === [...b].join('')) return 2;
  const common = [...a].filter((t) => b.has(t)).length;
  if (common === a.size && common === b.size) return 2;
  return common / a.size >= 0.5 ? 1 : 0;
}

// Treffer bewerten und den eindeutigen auswählen (falls es einen gibt)
function rank(entity, places) {
  const here = entity.lat !== null && entity.lat !== undefined ? { lat: Number(entity.lat), lng: Number(entity.lng) } : null;
  const list = places.map((p) => {
    const loc = p.location ? { lat: p.location.latitude, lng: p.location.longitude } : null;
    const country = (p.addressComponents || []).find((c) => (c.types || []).includes('country'));
    return {
      id: p.id,
      name: (p.displayName && p.displayName.text) || '',
      address: p.formattedAddress || '',
      country: country && country.shortText ? String(country.shortText).toUpperCase() : null,
      location: loc, // nur zum Abgleich im Speicher, wird nicht gespeichert
      distanceM: here && loc ? Math.round(distanceKm(here, loc) * 1000) : null,
      match: nameMatch(entity.name, (p.displayName && p.displayName.text) || ''),
    };
  });
  const near = list.filter((c) => c.distanceM !== null && c.distanceM <= MAX_DISTANCE_M && c.match > 0);
  const best = Math.max(0, ...near.map((c) => c.match));
  const top = near.filter((c) => c.match === best);
  return { candidates: list, pick: top.length === 1 ? top[0] : null };
}

function query(entity) {
  const a = (entity.attributes || {}).address || {};
  return [entity.name, a.street, a.postal_code, a.city || entity.city, entity.country ? countryName(entity.country) : null].filter(Boolean).join(', ');
}

async function search(entity) {
  if (!enabled()) throw new Error('GOOGLE_PLACES_KEY ist nicht gesetzt.');
  const body = { textQuery: query(entity), languageCode: 'de', maxResultCount: 5 };
  if (entity.lat !== null && entity.lat !== undefined) {
    body.locationBias = { circle: { center: { latitude: Number(entity.lat), longitude: Number(entity.lng) }, radius: 5000 } };
  }
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': config.googlePlacesKey, 'X-Goog-FieldMask': FIELDS },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Places: ${(data.error && data.error.message) || res.status}`);
  return rank(entity, data.places || []);
}

// Suchen und das Ergebnis als Vorschlag vormerken (nur ID, Entfernung, Namensabgleich)
async function suggest(entity) {
  const { candidates, pick } = await search(entity);
  const s = pick
    ? { status: 'found', id: pick.id, distance_m: pick.distanceM, match: pick.match }
    : { status: candidates.length ? 'unclear' : 'none', count: candidates.length };
  s.searched_at = new Date().toISOString();
  await db.query(`UPDATE entities SET attributes = attributes || jsonb_build_object('google_place_suggestion', $2::jsonb) WHERE id = $1`, [entity.id, JSON.stringify(s)]);
  return s;
}

const plain = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Ohne eigene Koordinaten: eindeutig nur, wenn genau ein Treffer im richtigen Land liegt, Ort oder Postleitzahl in
// seiner Anschrift vorkommen und sein Name am besten passt. Eine bloße Teilübereinstimmung zählt nur, wenn es
// keinen weiteren Treffer mit passendem Namen gibt.
function pickWithoutCoords(entity, candidates, { postalCode = null } = {}) {
  const cc = entity.country ? String(entity.country).toUpperCase() : null;
  const city = plain(entity.city);
  const plz = postalCode ? String(postalCode).replace(/\s/g, '') : null;
  const inPlace = (c) => (city && ` ${plain(c.address)} `.includes(` ${city} `)) || (plz && c.address.replace(/\s/g, '').includes(plz));
  const named = candidates.filter((c) => c.match > 0);
  const ok = named.filter((c) => c.location && (!cc || !c.country || c.country === cc) && inPlace(c));
  if (!ok.length) return null;
  const best = Math.max(...ok.map((c) => c.match));
  const top = ok.filter((c) => c.match === best);
  if (top.length !== 1) return null;
  if (best === 1 && named.length > 1) return null;
  return top[0];
}

// Hotel bei Google erkennen: Suche mit Name, Anschrift (von der Website), Ort und Land.
// Mit eigenen Koordinaten zählt die Entfernung (rank), sonst Land/Ort/Name (pickWithoutCoords).
// Rückgabe: { pick, candidates, query } – pick.location nur zum Abgleich, nie speichern.
async function identify(entity, { address = null } = {}) {
  const e = address ? { ...entity, attributes: { ...(entity.attributes || {}), address } } : entity;
  const { candidates, pick } = await search(e);
  const hasCoords = entity.lat !== null && entity.lat !== undefined;
  const chosen = hasCoords ? pick : pickWithoutCoords(entity, candidates, { postalCode: address && address.postal_code });
  return { pick: chosen, candidates, query: query(e) };
}

// Eindeutigen Treffer automatisch speichern – nie eine vorhandene (z. B. vom Admin eingetragene) ID überschreiben
async function saveAuto(entityId, pick) {
  const source = { via: 'auto', match: pick.match, distance_m: pick.distanceM, at: new Date().toISOString() };
  const r = await db.query(
    `UPDATE entities SET attributes = (attributes - 'google_place_suggestion')
       || jsonb_build_object('google_place_id', $2::text, 'google_place_source', $3::jsonb), updated_at = now()
      WHERE id = $1 AND NOT (attributes ? 'google_place_id')`,
    [entityId, pick.id, JSON.stringify(source)]);
  return r.rowCount > 0;
}

// Ergebnis ohne eindeutigen Treffer vormerken (nur Status und Anzahl, keine Google-Inhalte)
async function markUnclear(entityId, count) {
  const s = { status: count ? 'unclear' : 'none', count, searched_at: new Date().toISOString() };
  await db.query(`UPDATE entities SET attributes = attributes || jsonb_build_object('google_place_suggestion', $2::jsonb) WHERE id = $1`, [entityId, JSON.stringify(s)]);
  return s;
}

// Place ID übernehmen (oder Vorschlag verwerfen); Vorschlag wird dabei entfernt. Vom Admin = Quelle 'admin'
async function accept(entityId, placeId) {
  await db.query(
    `UPDATE entities SET attributes = (attributes - 'google_place_suggestion' - 'no_google_place')
       || jsonb_build_object('google_place_id', $2::text, 'google_place_source', jsonb_build_object('via', 'admin', 'at', now())), updated_at = now() WHERE id = $1`,
    [entityId, placeId]);
}
async function dismiss(entityId) {
  await db.query(
    `UPDATE entities SET attributes = attributes || jsonb_build_object('google_place_suggestion', jsonb_build_object('status', 'dismissed', 'searched_at', now())) WHERE id = $1`,
    [entityId]);
}

const mapsLink = (placeId) => `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(placeId)}`;

module.exports = {
  enabled, tokens, nameMatch, rank, pickWithoutCoords, query, search, identify, saveAuto, markUnclear, suggest, accept, dismiss, mapsLink, MAX_DISTANCE_M,
};
