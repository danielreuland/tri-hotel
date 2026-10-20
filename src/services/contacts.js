// Kontaktadresse eines Objekts, wenn die Website keine liefert:
//   2. OpenStreetMap (Tag email) – wird wie ein Website-Fund eingetragen („automatisch gefunden – bitte prüfen“)
//   3. Hunter.io (nur allgemeine Adressen) – nur als Vorschlag in attributes.contact_suggestion, der Admin übernimmt
// Bereits gesuchte Objekte werden für LOOKUP_DAYS nicht erneut bei Hunter abgefragt (Kontingent).
const db = require('../db');
const geo = require('./geo');
const hunter = require('./hunter');
const { logAction } = require('../lib/audit');

const LOOKUP_DAYS = 180;

function recentlySearched(entity) {
  const l = (entity.attributes || {}).contact_lookup || {};
  // gescheiterte Abfragen (z. B. Konto gesperrt) zählen nicht – beim nächsten Mal erneut fragen
  return Boolean(l.hunter_at && !hunter.lookupFailed(l) && Date.now() - new Date(l.hunter_at).getTime() < LOOKUP_DAYS * 86400000);
}

// force: Hunter auch abfragen, wenn kürzlich schon gesucht (Knopf im Admin). Ergebnis: Text fürs Protokoll
async function fallback(entity, { force = false } = {}) {
  if (entity.contact_email) return 'Kontaktadresse ist schon eingetragen.';
  // 2. OpenStreetMap
  try {
    const osm = await geo.findOsmContact({ name: entity.name, city: entity.city, country: entity.country });
    if (osm && osm.email) {
      const r = await db.query(
        `UPDATE entities SET contact_email = $2, contact_email_source = 'osm', contact_email_evidence = $3, updated_at = now()
          WHERE id = $1 AND contact_email IS NULL`, [entity.id, osm.email, osm.osmUrl]);
      if (r.rowCount) return `Kontakt-E-Mail aus OpenStreetMap: ${osm.email}.`;
    }
  } catch (err) {
    // OSM gestört: weiter mit Hunter
    console.error('[contacts] OSM', entity.id, err.message);
  }
  // 3. Hunter.io
  if (!hunter.enabled()) return 'Keine Kontakt-E-Mail gefunden – bitte in den Stammdaten ergänzen.';
  if (!entity.website) return 'Keine Kontakt-E-Mail gefunden; ohne Website keine Hunter-Suche – bitte ergänzen.';
  if (!force && recentlySearched(entity)) return 'Keine Kontakt-E-Mail gefunden (Hunter kürzlich ohne Ergebnis gefragt).';
  const { suggestion, reason, failed } = await hunter.findGenericEmail(entity.website, { entityId: entity.id });
  const lookup = { hunter_at: new Date().toISOString(), result: suggestion ? 'found' : failed ? 'failed' : 'none', reason: reason || null, failed: Boolean(failed) };
  await db.query(
    `UPDATE entities SET attributes = (attributes - 'contact_suggestion') || jsonb_build_object('contact_lookup', $2::jsonb)
       || CASE WHEN $3::jsonb IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('contact_suggestion', $3::jsonb) END, updated_at = now()
      WHERE id = $1`,
    [entity.id, JSON.stringify(lookup), suggestion ? JSON.stringify({ ...suggestion, source: 'hunter', found_at: lookup.hunter_at }) : null]
  );
  return suggestion
    ? `Vorschlag von Hunter.io: ${suggestion.email} (${suggestion.confidence} %) – bitte in den Stammdaten bestätigen.`
    : `Keine Kontakt-E-Mail gefunden (${reason}).`;
}

// Admin übernimmt den Vorschlag als Kontaktadresse (Quelle und Fundstelle bleiben erhalten)
async function acceptSuggestion(entityId, adminId) {
  const e = await db.one('SELECT id, contact_email, attributes FROM entities WHERE id = $1', [entityId]);
  const s = e && (e.attributes || {}).contact_suggestion;
  if (!s) return null;
  await db.query(
    `UPDATE entities SET contact_email = $2, contact_email_source = $3, contact_email_evidence = $4,
       attributes = attributes - 'contact_suggestion', updated_at = now() WHERE id = $1`,
    [e.id, s.email, s.source, s.evidenceUrl]
  );
  await logAction(adminId, 'entity', e.id, 'accept_contact_suggestion', { email: s.email, source: s.source, previous: e.contact_email || null });
  return s;
}

async function dismissSuggestion(entityId, adminId) {
  const r = await db.query(`UPDATE entities SET attributes = attributes - 'contact_suggestion', updated_at = now() WHERE id = $1 AND attributes ? 'contact_suggestion'`, [entityId]);
  if (r.rowCount) await logAction(adminId, 'entity', entityId, 'dismiss_contact_suggestion');
}

module.exports = { fallback, acceptSuggestion, dismissSuggestion, recentlySearched, LOOKUP_DAYS };
