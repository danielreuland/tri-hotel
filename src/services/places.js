// Google Place ID per Places API (New), Text Search. Gespeichert wird nur die Place ID
// (laut Google-Bedingungen dauerhaft speicherbar); Namen und Adressen von Google werden nur angezeigt, nicht gespeichert.
// Übernommen wird eine ID immer erst durch den Admin.
const db = require('../db');
const config = require('../config');
const { distanceKm } = require('./geo');
const { countryName } = require('../lib/seo');

const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const FIELDS = 'places.id,places.displayName,places.formattedAddress,places.location';
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
  const common = [...a].filter((t) => b.has(t)).length;
  if (common === a.size && common === b.size) return 2;
  return common / a.size >= 0.5 ? 1 : 0;
}

// Treffer bewerten und den eindeutigen auswählen (falls es einen gibt)
function rank(entity, places) {
  const here = entity.lat !== null && entity.lat !== undefined ? { lat: Number(entity.lat), lng: Number(entity.lng) } : null;
  const list = places.map((p) => {
    const loc = p.location ? { lat: p.location.latitude, lng: p.location.longitude } : null;
    return {
      id: p.id,
      name: (p.displayName && p.displayName.text) || '',
      address: p.formattedAddress || '',
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

// Place ID übernehmen (oder Vorschlag verwerfen); Vorschlag wird dabei entfernt
async function accept(entityId, placeId) {
  await db.query(
    `UPDATE entities SET attributes = (attributes - 'google_place_suggestion') || jsonb_build_object('google_place_id', $2::text), updated_at = now() WHERE id = $1`,
    [entityId, placeId]);
}
async function dismiss(entityId) {
  await db.query(
    `UPDATE entities SET attributes = attributes || jsonb_build_object('google_place_suggestion', jsonb_build_object('status', 'dismissed', 'searched_at', now())) WHERE id = $1`,
    [entityId]);
}

const mapsLink = (placeId) => `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(placeId)}`;

module.exports = { enabled, tokens, nameMatch, rank, query, search, suggest, accept, dismiss, mapsLink, MAX_DISTANCE_M };
