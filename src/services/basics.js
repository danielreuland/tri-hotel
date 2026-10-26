// Grunddaten eines Objekts: Website, Google-Eintrag (Place ID) und Koordinaten.
// Die eigentliche Auto-Prüfung (KI-Auswertung, Klima, Umgebung, Score) startet erst, wenn alle drei vorliegen.
// Fehlt etwas, wartet die Meldung im Status 'basics'; sobald der Admin ergänzt, läuft sie automatisch weiter.
//
// Herkunft steht in entities.attributes:
//   geo_source (Text), geo_manual (true = vom Admin gesetzt/bestätigt – nie automatisch überschreiben),
//   geo_suggestion ({ candidates: [{lat,lng,source,detail,confidence}], center, reason, google_distance_m, at }),
//   google_place_source ({ via: 'auto'|'admin', … }), no_website / no_google_place (Admin: gibt es nicht).
// Koordinaten kommen nur aus offenen Quellen (Website, OpenStreetMap); Google-Positionen dienen nur dem Abgleich.
const db = require('../db');
const places = require('./places');
const { distanceKm } = require('./geo');
const { logAction } = require('../lib/audit');

const KEYS = { website: 'Website', place: 'Google-Eintrag', coords: 'Koordinaten' };
const CONFIRM_M = 150; // OSM-Treffer gilt als bestätigt, wenn der Google-Eintrag so nah liegt

const hasCoords = (e) => e.lat !== null && e.lat !== undefined && e.lng !== null && e.lng !== undefined;

// Fehlende Grunddaten (Schlüssel aus KEYS); ohne Places-Schlüssel ist der Google-Eintrag nicht erforderlich
function missing(entity, { placesEnabled = places.enabled() } = {}) {
  const a = entity.attributes || {};
  const out = [];
  if (!entity.website && !a.no_website) out.push('website');
  if (placesEnabled && !a.google_place_id && !a.no_google_place) out.push('place');
  if (!hasCoords(entity)) out.push('coords');
  return out;
}

const describe = (keys) => keys.map((k) => KEYS[k]).join(', ');

// Entscheidung über einen Koordinaten-Treffer aus offenen Quellen.
//   hit: Ergebnis von geo.locate, googleLoc: Position des eindeutigen Google-Eintrags (nur im Speicher)
// Rückgabe: { save: true, note } oder { save: false, reason, googleDistanceM }
function judge(hit, googleLoc) {
  if (!hit || hit.lat === null) return { save: false, reason: 'In offenen Quellen nicht gefunden' };
  if (googleLoc) {
    const d = Math.round(distanceKm({ lat: hit.lat, lng: hit.lng }, googleLoc) * 1000);
    if (d <= CONFIRM_M) return { save: true, note: `bestätigt durch Google-Eintrag (${d} m)`, googleDistanceM: d };
    return { save: false, reason: `Weicht ${d.toLocaleString('de-DE')} m vom Google-Eintrag ab`, googleDistanceM: d };
  }
  if (hit.confidence === 'high') return { save: true, note: 'ohne Google-Abgleich' };
  return { save: false, reason: hit.confidence === 'low' ? 'Nur ungefähr (Postleitzahlgebiet)' : 'Nur über die Namenssuche gefunden, nicht bestätigt' };
}

// Automatisch gefundene Koordinaten speichern – nie über vorhandene oder vom Admin gesetzte
async function saveAuto(entityId, hit, note) {
  const source = `${hit.source}${hit.url ? ` (${hit.url})` : ''}${note ? ` – ${note}` : ''}`;
  const r = await db.query(
    `UPDATE entities SET lat = $2, lng = $3, attributes = (attributes - 'geo_suggestion') || jsonb_build_object('geo_source', $4::text), updated_at = now()
      WHERE id = $1 AND lat IS NULL AND NOT COALESCE((attributes->>'geo_manual')::boolean, false)`,
    [entityId, hit.lat, hit.lng, source]);
  return r.rowCount > 0;
}

// Vorschlag zur Bestätigung im Admin vormerken
async function suggest(entityId, { hit, reason, googleDistanceM = null }) {
  const s = {
    candidates: hit && hit.lat !== null ? [{ lat: hit.lat, lng: hit.lng, source: hit.source, detail: hit.detail, confidence: hit.confidence }] : [],
    center: hit && hit.center ? { lat: hit.center.lat, lng: hit.center.lng } : null,
    reason, google_distance_m: googleDistanceM, at: new Date().toISOString(),
  };
  await db.query(`UPDATE entities SET attributes = attributes || jsonb_build_object('geo_suggestion', $2::jsonb) WHERE id = $1`, [entityId, JSON.stringify(s)]);
  return s;
}

// Koordinaten vom Admin (von Hand, Klick in die Karte oder Vorschlag übernommen) – gelten als manuell
async function setManual(entityId, lat, lng, how, adminId) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Ungültige Koordinaten.');
  const old = await db.one('SELECT lat, lng FROM entities WHERE id = $1', [entityId]);
  await db.query(
    `UPDATE entities SET lat = $2, lng = $3,
       attributes = (attributes - 'geo_suggestion') || jsonb_build_object('geo_source', $4::text, 'geo_manual', true), updated_at = now()
     WHERE id = $1`,
    [entityId, lat, lng, `Admin: ${how}`]);
  await logAction(adminId, 'entity', entityId, 'set_coordinates', { old: old && { lat: old.lat, lng: old.lng }, new: { lat, lng }, how });
}

// „Gibt es nicht“ für Website oder Google-Eintrag (zählt dann als erledigt)
async function setAbsent(entityId, key, absent, adminId) {
  const attr = { website: 'no_website', place: 'no_google_place' }[key];
  if (!attr) throw new Error('Unbekannte Angabe.');
  await db.query(
    absent
      ? `UPDATE entities SET attributes = attributes || jsonb_build_object('${attr}', true), updated_at = now() WHERE id = $1`
      : `UPDATE entities SET attributes = attributes - '${attr}', updated_at = now() WHERE id = $1`,
    [entityId]);
  await logAction(adminId, 'entity', entityId, absent ? `mark_${attr}` : `unmark_${attr}`);
}

// Nach einer Änderung im Admin: wartende Meldung fortsetzen bzw. bei geänderten Koordinaten Klima, Umgebung
// und Score im Hintergrund nachziehen. Rückgabe: Hinweistext für den Admin (oder null).
async function continueIfReady(submissionId, { coordsChanged = false } = {}) {
  const submissions = require('./submissions');
  const sub = await db.one('SELECT * FROM submissions WHERE id = $1', [submissionId]);
  if (!sub || !sub.entity_id) return null;
  const entity = await db.one('SELECT * FROM entities WHERE id = $1', [sub.entity_id]);
  if (sub.status === 'basics') {
    const miss = missing(entity);
    if (miss.length) return `Es fehlt noch: ${describe(miss)}.`;
    await submissions.appendLog(sub.id, 'Grunddaten', true, 'Vollständig – Auto-Prüfung läuft weiter.');
    await submissions.enqueue('auto-check', { submissionId: sub.id });
    return 'Grunddaten vollständig – die Auto-Prüfung läuft weiter.';
  }
  if (coordsChanged && hasCoords(entity) && ['auto_check', 'admin_review', 'live'].includes(sub.status)) {
    await submissions.enqueue('geo-followup', { submissionId: sub.id });
    return 'Klima, Umgebung und Score werden mit den neuen Koordinaten nachgezogen.';
  }
  return null;
}

module.exports = { KEYS, CONFIRM_M, missing, describe, judge, saveAuto, suggest, setManual, setAbsent, continueIfReady, hasCoords };
