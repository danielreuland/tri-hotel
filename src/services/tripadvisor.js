// Tripadvisor-Fotos über die Terra-API als Platzhalter für Objekte ohne eigene Fotos (B-87).
// Vorgaben und offene Punkte: docs/tripadvisor-fotos-umsetzung.md.
//
// Regeln, die hier durchgesetzt werden:
// - Jeder Aufruf läuft über den Budget-Wächter (lib/ta-budget.js); ohne TA_PHOTOS_ENABLED=true geht nichts raus.
// - Gespeichert wird nur die Location ID. Namen, Adressen, Koordinaten und Bildadressen von Tripadvisor werden nur
//   in der laufenden Antwort verwendet (Abgleich, Anzeige), nie in Datenbank, Log oder Cache geschrieben.
// - Allowlist: nur APPEND und DELETE. OVERWRITE gibt es hier bewusst nicht.
// - Kein Einfluss auf Score, Reihenfolge oder Faktenprüfung.
const db = require('../db');
const config = require('../config');
const budget = require('../lib/ta-budget');
const { nameMatch } = require('./places');
const { distanceKm } = require('./geo');

const API = 'https://terra.tripadvisor.com/api';
const MAX_DISTANCE_M = 200; // eindeutiger Treffer: so nah an unseren Koordinaten
const NEARBY_RADIUS_KM = 1;
// Kategorie bei Tripadvisor je Objekttyp; ohne Zuordnung wird ohne Kategorie gesucht
const CATEGORY = { hotel: 'HOTEL', restaurant: 'RESTAURANT' };
const cfg = config.tripadvisor;

const STATUS_LABELS = {
  active: 'aktiv', no_id: 'Location ID fehlt', disabled: 'nicht ausgewählt', own_photos: 'eigene Fotos vorhanden',
  off: 'Not-Aus', allowlist_pending: 'Allowlist ausstehend',
};
const REASONS = {
  off: 'Not-Aus: TA_PHOTOS_ENABLED ist nicht „true“ – es wurde nichts abgerufen.',
  no_key: 'TRIPADVISOR_API_KEY fehlt – es wurde nichts abgerufen.',
  month_limit: 'Monatsgrenze erreicht – es wurde nichts abgerufen.',
  day_limit: 'Tagesgrenze erreicht – es wurde nichts abgerufen.',
  timeout: 'Tripadvisor hat nicht rechtzeitig geantwortet.',
  error: 'Tripadvisor hat einen Fehler gemeldet.',
  no_coords: 'Das Objekt hat keine Koordinaten.',
  no_name: 'Das Objekt hat keinen Namen.',
};
const reasonText = (r, status) => `${REASONS[r] || 'Abruf nicht möglich.'}${status ? ` (Status ${status})` : ''}`;

// ---------- reine Funktionen (getestet) ----------

// Zustand eines Objekts: no_id | disabled | own_photos | off | allowlist_pending | active
function photoStatus(entity, { ownImages = 0, c = cfg } = {}) {
  if (!entity.ta_location_id) return 'no_id';
  if (!entity.ta_photos_enabled) return 'disabled';
  if (ownImages > 0) return 'own_photos';
  if (!c.enabled || !c.apiKey) return 'off';
  if (c.allowlist && !entity.ta_allowlisted_at) return 'allowlist_pending';
  return 'active';
}

// Bildadresse nur von den erlaubten Hosts und nur per https
function allowedImageUrl(url, hosts = cfg.imageHosts) {
  try {
    const u = new URL(String(url));
    if (u.protocol !== 'https:') return null;
    const h = u.hostname.toLowerCase();
    return hosts.some((x) => h === x || h.endsWith(`.${x}`)) ? u.toString() : null;
  } catch {
    return null;
  }
}

function withPhotoParams(url, params) {
  const p = String(params || '').replace(/^[?&]/, '');
  return p ? `${url}${url.includes('?') ? '&' : '?'}${p}` : url;
}

// Antwort des Foto-Endpunkts → höchstens photoCount Bilder für die Anzeige (unverändert, nur die nötigen Felder)
function mapPhotos(body, c = cfg) {
  const text = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  return ((body && body.data) || [])
    .map((p) => {
      const info = (p && p.photo) || {};
      const url = allowedImageUrl(info.original_size_url, c.imageHosts);
      if (!url) return null;
      return {
        url: withPhotoParams(url, c.photoParams),
        width: Number(info.original_width) || null,
        height: Number(info.original_height) || null,
        caption: text(p.caption, 300),
        username: text(p.user && p.user.username, 80),
        source: text(p.source && p.source.name, 40),
        published: text(p.publish_ts, 10),
      };
    })
    .filter(Boolean)
    .slice(0, c.photoCount);
}

// Links zur Tripadvisor-Seite des Objekts und zu „alle Fotos“ (aus der Location ID gebildet)
function links(locationId, c = cfg) {
  const id = String(Number(locationId));
  return { page: c.locationUrl.replace('{id}', id), photos: c.photosUrl.replace('{id}', id) };
}

// Abfrage für die Suche: name_city (Name, Land, Ort) | name (Name, Land) | nearby (Umkreis um unsere Koordinaten)
function searchParams(entity, mode, c = cfg) {
  const category = CATEGORY[entity.entity_type];
  const base = { version: '1', size: String(c.searchSize), ...(category ? { category } : {}) };
  if (mode === 'nearby') {
    if (entity.lat === null || entity.lat === undefined || entity.lng === null || entity.lng === undefined) return null;
    return { ...base, lat: String(Number(entity.lat)), lon: String(Number(entity.lng)), radius: String(NEARBY_RADIUS_KM), unit: 'KM', sort: 'distance,asc' };
  }
  const name = String(entity.name || '').trim().slice(0, 500);
  if (!name) return null;
  const cc = String(entity.country || '').toUpperCase();
  return {
    ...base, query: name, search_type: 'NAME',
    ...(/^[A-Z]{2}$/.test(cc) ? { country_code: cc } : {}),
    ...(mode === 'name_city' && entity.city ? { geo_name: String(entity.city) } : {}),
  };
}

// Treffer bewerten: Entfernung zu unseren Koordinaten und Namensabgleich; eindeutig ist genau ein naher Treffer mit
// dem besten Namen. items: [{ loc: <CatalogLocation>, km: <Entfernung laut Tripadvisor, nur Umkreissuche> }]
function rank(entity, items) {
  const here = entity.lat !== null && entity.lat !== undefined ? { lat: Number(entity.lat), lng: Number(entity.lng) } : null;
  const candidates = (items || [])
    .map(({ loc, km }) => {
      if (!loc || !Number.isInteger(loc.id) || loc.id <= 0) return null;
      const names = (loc.names || []).filter((n) => n && n.value);
      const addr = (loc.addresses || [])[0] || {};
      const co = loc.coordinates;
      const far = typeof km === 'number' ? km : here && co ? distanceKm(here, { lat: co.latitude, lng: co.longitude }) : null;
      const url = loc.urls && loc.urls.tripadvisor && loc.urls.tripadvisor.main;
      return {
        id: loc.id,
        name: ((names.find((n) => n.primary) || names[0] || {}).value) || '',
        address: addr.formatted || [addr.street_address, addr.postal_code, addr.city].filter(Boolean).join(', '),
        distanceM: far === null ? null : Math.round(far * 1000),
        match: Math.max(0, ...names.map((n) => nameMatch(entity.name, n.value))),
        url: allowedImageUrl(url, ['tripadvisor.com', 'tripadvisor.de']), // nur für die laufende Anzeige im Admin
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.match - a.match || (a.distanceM === null ? Infinity : a.distanceM) - (b.distanceM === null ? Infinity : b.distanceM));
  const near = candidates.filter((x) => x.distanceM !== null && x.distanceM <= MAX_DISTANCE_M && x.match > 0);
  const best = Math.max(0, ...near.map((x) => x.match));
  const top = near.filter((x) => x.match === best);
  return { candidates, pick: top.length === 1 ? top[0] : null };
}

// Vormerkung einer Suche: nur Status, IDs und Zeitpunkt
function suggestion(result, at = new Date()) {
  const ids = result.candidates.map((x) => x.id);
  return result.pick
    ? { status: 'found', id: result.pick.id, ids, at: at.toISOString() }
    : { status: ids.length ? 'unclear' : 'none', ids, at: at.toISOString() };
}

// Abgleich mit der Allowlist: ausgewählte Objekte ohne Eintrag hinzufügen, abgewählte mit Eintrag entfernen
function allowlistPlan(rows) {
  const ok = (r) => Number.isInteger(r.ta_location_id) && r.ta_location_id > 0;
  return {
    append: rows.filter((r) => ok(r) && r.ta_photos_enabled && !r.ta_allowlisted_at),
    remove: rows.filter((r) => ok(r) && !r.ta_photos_enabled && r.ta_allowlisted_at),
  };
}

// Vorschlag für die Auswahl: die besten Objekte nach Score, die eine Location ID und keine eigenen Fotos haben
function suggestTop(rows, max = cfg.maxHotels) {
  return rows
    .filter((r) => r.ta_location_id && !r.own_images && r.score !== null && r.score !== undefined)
    .sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name), 'de'))
    .slice(0, max)
    .map((r) => r.id);
}

// ---------- Zähler und Protokoll in der Datenbank ----------

class LimitReached extends Error {
  constructor(which) { super(which); this.which = which; }
}

const dbStore = {
  // Atomar: beide Grenzen prüfen und erhöhen; Zeilensperren sorgen dafür, dass parallele Prozesse nicht überziehen
  async reserve(keys, units, limits) {
    try {
      await db.tx(async (c) => {
        await c.query(`INSERT INTO ta_budget (period) VALUES ($1), ($2), ($3) ON CONFLICT (period) DO NOTHING`, [keys.month, keys.day, keys.total]);
        const add = `UPDATE ta_budget SET units = units + $2, updated_at = now() WHERE period = $1 AND units + $2 <= $3`;
        if (!(await c.query(add, [keys.month, units, limits.month])).rowCount) throw new LimitReached('month');
        if (!(await c.query(add, [keys.day, units, limits.day])).rowCount) throw new LimitReached('day');
        await c.query(`UPDATE ta_budget SET units = units + $2, updated_at = now() WHERE period = $1`, [keys.total, units]);
      });
      return { ok: true };
    } catch (err) {
      if (err instanceof LimitReached) return { ok: false, blocked: err.which };
      throw err;
    }
  },
  async adjust(keys, diff) {
    await db.query(`UPDATE ta_budget SET units = GREATEST(0, units + $2), updated_at = now() WHERE period = ANY($1)`, [[keys.month, keys.day, keys.total], diff]);
  },
  async log({ entityId, endpoint, units, status, durationMs, outcome }) {
    await db.query(
      `INSERT INTO ta_calls (entity_id, endpoint, units, http_status, duration_ms, outcome) VALUES ($1, $2, $3, $4, $5, $6)`,
      [entityId || null, endpoint, units, status, durationMs, outcome]);
  },
};

const guard = budget.createGuard({ cfg, store: dbStore });

async function usage(now = new Date()) {
  const keys = budget.periodKeys(now);
  const rows = await db.many(`SELECT period, units FROM ta_budget WHERE period = ANY($1)`, [[keys.month, keys.day, keys.total]]);
  const by = new Map(rows.map((r) => [r.period, r.units]));
  return budget.summary({ month: by.get(keys.month) || 0, day: by.get(keys.day) || 0, total: by.get(keys.total) || 0 }, cfg);
}

// ---------- Abrufe ----------

// Fotos eines Objekts: { available, photos, reason }
async function photos(entity) {
  const id = Number(entity.ta_location_id);
  if (!Number.isInteger(id) || id <= 0) return { available: false, reason: 'no_id' };
  const r = await guard.call('photos', { url: `${API}/locations/${id}/photos?version=1&size=${cfg.photoCount}`, entityId: entity.id });
  if (!r.ok) return { available: false, reason: r.reason };
  const list = mapPhotos(r.data);
  return list.length ? { available: true, photos: list } : { available: false, reason: 'empty' };
}

// Location ID suchen: { ok, reason, status, units, candidates, pick }
async function search(entity, mode = 'name_city') {
  const params = searchParams(entity, mode);
  if (!params) return { ok: false, reason: mode === 'nearby' ? 'no_coords' : 'no_name' };
  const nearby = mode === 'nearby';
  const r = await guard.call(nearby ? 'nearby' : 'search', {
    url: `${API}/catalog/locations/${nearby ? 'nearby' : 'search'}?${new URLSearchParams(params)}`, entityId: entity.id,
  });
  if (!r.ok) return { ok: false, reason: r.reason, status: r.status };
  const items = ((r.data && r.data.data) || []).map((d) => ({ loc: d.location, km: d.distance_kilometers }));
  return { ok: true, units: r.units, ...rank(entity, items) };
}

async function saveSuggestion(entityId, result) {
  const s = suggestion(result);
  await db.query(`UPDATE entities SET ta_suggestion = $2::jsonb WHERE id = $1 AND ta_location_id IS NULL`, [entityId, JSON.stringify(s)]);
  return s;
}

async function dismissSuggestion(entityId) {
  await db.query(`UPDATE entities SET ta_suggestion = jsonb_build_object('status', 'dismissed', 'ids', '[]'::jsonb, 'at', now()) WHERE id = $1`, [entityId]);
}

// Location ID setzen oder entfernen (id = null). Nur solange das Objekt nicht ausgewählt ist und nicht auf der
// Allowlist steht – sonst bliebe die alte ID dort zurück.
async function setLocationId(entityId, id) {
  const value = id === null ? null : Number(id);
  if (value !== null && (!Number.isInteger(value) || value <= 0 || value > 2147483647)) return { ok: false, error: 'Die Location ID ist eine positive ganze Zahl.' };
  const old = await db.one(`SELECT ta_location_id, ta_photos_enabled, ta_allowlisted_at FROM entities WHERE id = $1`, [entityId]);
  if (!old) return { ok: false, error: 'Objekt nicht gefunden.' };
  if (old.ta_photos_enabled || old.ta_allowlisted_at) return { ok: false, error: 'Erst die Tripadvisor-Fotos abwählen und die Allowlist abgleichen, dann die Location ID ändern.' };
  try {
    await db.query(`UPDATE entities SET ta_location_id = $2, ta_suggestion = NULL, updated_at = now() WHERE id = $1`, [entityId, value]);
  } catch (err) {
    if (err.code === '23505') return { ok: false, error: 'Diese Location ID gehört schon zu einem anderen Objekt.' };
    throw err;
  }
  return { ok: true, old: old.ta_location_id, new: value };
}

// Allowlist bei Tripadvisor ändern – ausschließlich APPEND oder DELETE
async function allowlistChange(op, ids) {
  if (!['APPEND', 'DELETE'].includes(op)) throw new Error('Allowlist: nur APPEND und DELETE sind erlaubt.');
  const list = [...new Set(ids.map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  if (!list.length) return { ok: true, count: 0 };
  const r = await guard.call(op === 'APPEND' ? 'allowlist_append' : 'allowlist_delete', {
    url: `${API}/allowlist?version=1`, method: 'POST', body: { operation_type: op, allowlist: list },
  });
  return { ok: r.ok, reason: r.reason, status: r.status, count: list.length };
}

// Ausstehende Änderungen an die Allowlist übertragen: { skipped } | { added, removed, errors: [text] }
async function syncAllowlist() {
  if (!cfg.allowlist) return { skipped: true, added: 0, removed: 0, errors: [] };
  const rows = await db.many(
    `SELECT id, ta_location_id, ta_photos_enabled, ta_allowlisted_at FROM entities
      WHERE ta_location_id IS NOT NULL AND ((ta_photos_enabled AND ta_allowlisted_at IS NULL) OR (NOT ta_photos_enabled AND ta_allowlisted_at IS NOT NULL))`);
  const plan = allowlistPlan(rows);
  const out = { added: 0, removed: 0, errors: [] };
  if (plan.append.length) {
    const r = await allowlistChange('APPEND', plan.append.map((x) => x.ta_location_id));
    if (r.ok) {
      await db.query(`UPDATE entities SET ta_allowlisted_at = now() WHERE id = ANY($1::uuid[])`, [plan.append.map((x) => x.id)]);
      out.added = plan.append.length;
    } else out.errors.push(`Hinzufügen: ${reasonText(r.reason, r.status)}`);
  }
  if (plan.remove.length) {
    const r = await allowlistChange('DELETE', plan.remove.map((x) => x.ta_location_id));
    if (r.ok) {
      await db.query(`UPDATE entities SET ta_allowlisted_at = NULL WHERE id = ANY($1::uuid[])`, [plan.remove.map((x) => x.id)]);
      out.removed = plan.remove.length;
    } else out.errors.push(`Entfernen: ${reasonText(r.reason, r.status)}`);
  }
  return out;
}

// Allowlist bei Tripadvisor lesen (kostet nichts): { ok, ids, reason, status }
async function allowlistRemote() {
  const ids = [];
  let cursor = null;
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ version: '1', size: '1000', ...(cursor ? { cursor } : {}) });
    const r = await guard.call('allowlist_get', { url: `${API}/allowlist?${q}` });
    if (!r.ok) return { ok: false, reason: r.reason, status: r.status, ids };
    for (const id of (r.data && r.data.data) || []) if (Number.isInteger(id)) ids.push(id);
    cursor = r.data && r.data.pagination && r.data.pagination.next_cursor;
    if (!cursor) break;
  }
  return { ok: true, ids };
}

// ---------- Besucher ----------

// Höchstens ein Abruf je Besucher (gehashte IP) und Objekt im Sperrzeitraum; true = dieser Abruf ist erlaubt
async function acquireViewLock(ipHash, entityId) {
  const r = await db.query(
    `INSERT INTO ta_view_locks (ip_hash, entity_id) VALUES ($1, $2)
     ON CONFLICT (ip_hash, entity_id) DO UPDATE SET created_at = now()
       WHERE ta_view_locks.created_at < now() - make_interval(mins => $3)`,
    [ipHash, entityId, cfg.viewLockMinutes]);
  return r.rowCount > 0;
}

// Zahl der eigenen, freigegebenen und gültigen Bilder eines Objekts (haben Vorrang vor Tripadvisor)
const OWN_IMAGES_SQL = `(SELECT count(*)::int FROM entity_images i WHERE i.entity_id = e.id AND i.approved_at IS NOT NULL
  AND (i.valid_until IS NULL OR i.valid_until >= current_date))`;

// ---------- Admin-Übersicht ----------

async function overview() {
  const monthStart = `(date_trunc('month', now() AT TIME ZONE '${budget.TZ}') AT TIME ZONE '${budget.TZ}')`;
  const rows = await db.many(
    `SELECT e.id, e.name, e.slug, e.entity_type, e.city, e.country, e.lat, e.lng, e.ta_location_id, e.ta_photos_enabled, e.ta_allowlisted_at, e.ta_suggestion,
            s.score, ${OWN_IMAGES_SQL} AS own_images,
            (SELECT COALESCE(sum(c.units), 0)::int FROM ta_calls c WHERE c.entity_id = e.id AND c.created_at >= ${monthStart}) AS month_units,
            (SELECT max(c.created_at) FROM ta_calls c WHERE c.entity_id = e.id AND c.endpoint = 'photos' AND c.outcome = 'ok') AS last_fetch,
            (SELECT sub.id FROM submissions sub WHERE sub.entity_id = e.id ORDER BY sub.created_at DESC LIMIT 1) AS sub_id
       FROM entities e
       LEFT JOIN LATERAL (SELECT max(er.score)::int AS score FROM entity_rankings er WHERE er.entity_id = e.id AND er.status = 'live') s ON true
      WHERE s.score >= $1 OR e.ta_location_id IS NOT NULL OR e.ta_photos_enabled OR e.ta_allowlisted_at IS NOT NULL
      ORDER BY s.score DESC NULLS LAST, lower(e.name)`, [cfg.minScore]);
  const top = new Set(suggestTop(rows));
  for (const r of rows) {
    r.live = r.score !== null;
    r.status = photoStatus(r, { ownImages: r.own_images });
    r.suggested = top.has(r.id);
  }
  const errors = await db.many(
    `SELECT c.created_at, c.endpoint, c.http_status, c.duration_ms, c.outcome, e.name
       FROM ta_calls c LEFT JOIN entities e ON e.id = c.entity_id
      WHERE c.outcome <> 'ok' ORDER BY c.created_at DESC LIMIT 20`);
  return { rows, errors, usage: await usage() };
}

module.exports = {
  // reine Funktionen
  photoStatus, allowedImageUrl, mapPhotos, links, searchParams, rank, suggestion, allowlistPlan, suggestTop, reasonText,
  // Abrufe und Daten
  photos, search, saveSuggestion, dismissSuggestion, setLocationId, allowlistChange, syncAllowlist, allowlistRemote,
  acquireViewLock, usage, overview,
  STATUS_LABELS, MAX_DISTANCE_M, OWN_IMAGES_SQL, cfg,
};
