// Camp-Anbieter: neutral gelistet (alphabetisch), ohne Score. Partnerstatus wird nur gekennzeichnet.
const db = require('../db');

const MODELS = {
  operator: 'Reiseveranstalter',
  coach: 'Coach-Camp',
  resort: 'Sportresort / Trainingszentrum',
  community: 'Spezial- und Community-Camp',
  group: 'Vereins- und Gruppenreise',
};

// Merkmale für Matrix und Filter (Werte in camp_providers.features)
const FLAGS = {
  beginner: 'Einsteiger',
  women: 'Frauen-Camp',
  swim: 'Schwimm-Camp',
  family: 'Familie / Kinder',
  camp_only: 'Camp ohne Hotel',
  flight: 'Flug buchbar',
};
const HOTEL_VALUES = { yes: 'im Paket', optional: 'optional', partner: 'über Partner', required: 'Pflicht (Resort)', no: 'nicht enthalten', unknown: 'nicht erkennbar' };
const FLIGHT_VALUES = { yes: 'buchbar', partner: 'über Partner', no: 'nicht im Angebot', unknown: 'nicht erkennbar' };

// Ja/Nein/unbekannt eines Merkmals (Flug: "yes"/"partner" zählt als ja)
function flag(p, key) {
  const v = (p.features || {})[key];
  if (key === 'flight') return v === 'yes' || v === 'partner' ? true : v === 'no' ? false : null;
  return v === true ? true : v === false ? false : null;
}

function parseFilters(q) {
  const f = {
    model: MODELS[q.typ] ? q.typ : null,
    region: String(q.region || '').trim().slice(0, 40) || null,
    flags: [].concat(q.merkmal || []).filter((k) => FLAGS[k]),
  };
  f.active = Boolean(f.model || f.region || f.flags.length);
  return f;
}

async function list(siteId, filters = {}) {
  const rows = await db.many(
    `SELECT p.*, COALESCE(json_agg(json_build_object('hotel_name', h.hotel_name, 'place', h.place, 'region', h.region, 'entity_id', h.entity_id)
              ORDER BY h.sort_order) FILTER (WHERE h.id IS NOT NULL), '[]') AS hotels
       FROM camp_providers p LEFT JOIN camp_provider_hotels h ON h.provider_id = p.id
      WHERE p.site_id = $1 AND p.status = 'active'
      GROUP BY p.id ORDER BY lower(p.name)`,
    [siteId]
  );
  return rows.filter((p) =>
    (!filters.model || p.model === filters.model)
    && (!filters.region || p.regions.includes(filters.region))
    && (filters.flags || []).every((k) => flag(p, k) === true));
}

async function regions(siteId) {
  const rows = await db.many(`SELECT DISTINCT unnest(regions) AS r FROM camp_providers WHERE site_id = $1 AND status = 'active' ORDER BY 1`, [siteId]);
  return rows.map((r) => r.r);
}

async function bySlug(siteId, slug) {
  return db.one(`SELECT * FROM camp_providers WHERE site_id = $1 AND slug = $2 AND status = 'active'`, [siteId, slug]);
}

// Hotels eines Anbieters, mit Link und Score, falls das Hotel im Ranking live ist
async function hotelsOf(providerId, rankingId) {
  return db.many(
    `SELECT h.*, e.slug AS entity_slug, e.name AS entity_name, er.score, er.status AS ranking_status, er.completeness
       FROM camp_provider_hotels h
       LEFT JOIN entities e ON e.id = h.entity_id
       LEFT JOIN entity_rankings er ON er.entity_id = e.id AND er.ranking_id = $2 AND er.status = 'live'
      WHERE h.provider_id = $1 ORDER BY h.sort_order`,
    [providerId, rankingId]
  );
}

// Anbieter, die in einem Hotel Camps durchführen (für die Hotelseite)
// Anbieter-Hotel einem Objekt zuordnen: gleicher Name (ohne Allerweltswörter wie „Hotel“, Akzente egal), nur eindeutige Treffer
async function matchEntity(hotelName, client = db) {
  const { nameMatch } = require('./places');
  const rows = client.query ? (await client.query('SELECT id, name FROM entities')).rows : await db.many('SELECT id, name FROM entities');
  const hits = rows.filter((e) => nameMatch(hotelName, e.name) === 2);
  return hits.length === 1 ? hits[0].id : null;
}

// ---------- Verknüpfung Hotel ↔ Camp-Anbieter per Auswahl ----------

// Objekte der aktiven Rankings einer Site für die Auswahl (Name, Ort; live oder nicht)
async function entityOptions(siteId) {
  return db.many(
    `SELECT e.id, e.name, e.city, e.country, bool_or(er.status = 'live') AS live
       FROM entities e JOIN entity_rankings er ON er.entity_id = e.id JOIN rankings r ON r.id = er.ranking_id
      WHERE r.status = 'active' AND r.site_id = $1 AND er.status <> 'rejected'
      GROUP BY e.id ORDER BY lower(e.name)`, [siteId]);
}

async function providerOptions(siteId) {
  return db.many(`SELECT id, name, status, seat FROM camp_providers WHERE site_id = $1 AND status <> 'archived' ORDER BY lower(name)`, [siteId]);
}

// Vorschlag für eine freie Zeile (Hotel nicht verknüpft): bestes Objekt nach Namen, bei Gleichstand der gleiche Ort.
// Nie automatisch verknüpfen – nur anzeigen. Ergebnis: { entity, exact } oder null
function suggestEntity(row, entities) {
  const { nameMatch } = require('./places');
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  let best = null;
  for (const e of entities) {
    const m = nameMatch(row.hotel_name, e.name) || nameMatch(e.name, row.hotel_name);
    if (!m) continue;
    const samePlace = Boolean(row.place && e.city && norm(row.place) === norm(e.city));
    const score = m * 2 + (samePlace ? 1 : 0);
    if (!best || score > best.score) best = { entity: e, exact: m === 2, score };
    else if (score === best.score) best.ambiguous = true;
  }
  return best && !best.ambiguous ? { entity: best.entity, exact: best.exact } : null;
}

// Hotels eines Anbieters speichern: verknüpfte Objekte (Reihenfolge der Auswahl) + freie Zeilen „Name | Ort | Region“.
// Bestehende Zeilen behalten ihre ID (gleiches Objekt bzw. gleicher freier Name); Ort/Region verknüpfter Zeilen aus dem Objekt.
async function saveProviderHotels(client, providerId, { entityIds = [], free = [] }) {
  const old = (await client.query('SELECT * FROM camp_provider_hotels WHERE provider_id = $1', [providerId])).rows;
  const ents = entityIds.length ? (await client.query('SELECT id, name, city FROM entities WHERE id = ANY($1::uuid[])', [entityIds])).rows : [];
  const keep = new Set();
  let i = 0;
  for (const id of entityIds) {
    const e = ents.find((x) => x.id === id);
    if (!e) continue;
    const prev = old.find((r) => r.entity_id === id && !keep.has(r.id));
    if (prev) {
      await client.query('UPDATE camp_provider_hotels SET hotel_name = $2, place = $3, sort_order = $4 WHERE id = $1', [prev.id, e.name, e.city || prev.place, i++]);
      keep.add(prev.id);
    } else {
      const r = await client.query('INSERT INTO camp_provider_hotels (provider_id, entity_id, hotel_name, place, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [providerId, id, e.name, e.city || null, i++]);
      keep.add(r.rows[0].id);
    }
  }
  for (const h of free) {
    if (!h.hotel_name) continue;
    const prev = old.find((r) => !r.entity_id && r.hotel_name === h.hotel_name && !keep.has(r.id));
    if (prev) {
      await client.query('UPDATE camp_provider_hotels SET place = $2, region = $3, sort_order = $4 WHERE id = $1', [prev.id, h.place || null, h.region || null, i++]);
      keep.add(prev.id);
    } else {
      const r = await client.query('INSERT INTO camp_provider_hotels (provider_id, entity_id, hotel_name, place, region, sort_order) VALUES ($1,NULL,$2,$3,$4,$5) RETURNING id',
        [providerId, h.hotel_name, h.place || null, h.region || null, i++]);
      keep.add(r.rows[0].id);
    }
  }
  const removed = old.filter((r) => !keep.has(r.id));
  if (removed.length) await client.query('DELETE FROM camp_provider_hotels WHERE id = ANY($1::uuid[])', [removed.map((r) => r.id)]);
  return { linked: entityIds.length, free: free.filter((h) => h.hotel_name).length, removed: removed.map((r) => r.hotel_name) };
}

// Von der Objektseite aus: Anbieter dieses Objekts setzen (fügt Zeilen hinzu bzw. entfernt nur die Verknüpfungen dieses Objekts)
async function setEntityProviders(client, entity, providerIds) {
  const old = (await client.query('SELECT id, provider_id FROM camp_provider_hotels WHERE entity_id = $1', [entity.id])).rows;
  const added = [];
  for (const pid of providerIds) {
    if (old.some((r) => r.provider_id === pid)) continue;
    // freie Zeile mit passendem Namen beim Anbieter übernehmen statt doppelt anzulegen
    const free = (await client.query('SELECT id, hotel_name FROM camp_provider_hotels WHERE provider_id = $1 AND entity_id IS NULL', [pid])).rows
      .find((r) => suggestEntity({ hotel_name: r.hotel_name, place: null }, [entity]));
    if (free) {
      await client.query('UPDATE camp_provider_hotels SET entity_id = $2, hotel_name = $3, place = COALESCE($4, place) WHERE id = $1', [free.id, entity.id, entity.name, entity.city || null]);
    } else {
      await client.query(
        `INSERT INTO camp_provider_hotels (provider_id, entity_id, hotel_name, place, sort_order)
         VALUES ($1, $2, $3, $4, (SELECT COALESCE(max(sort_order), -1) + 1 FROM camp_provider_hotels WHERE provider_id = $1))`,
        [pid, entity.id, entity.name, entity.city || null]);
    }
    added.push(pid);
  }
  const removed = old.filter((r) => !providerIds.includes(r.provider_id));
  if (removed.length) await client.query('DELETE FROM camp_provider_hotels WHERE id = ANY($1::uuid[])', [removed.map((r) => r.id)]);
  return { added, removed: removed.map((r) => r.provider_id) };
}

// Noch nicht verknüpfte Anbieter-Hotels zuordnen; Rückgabe: neu verknüpfte Paare
async function autoLink() {
  const open = await db.many(`SELECT h.id, h.hotel_name, p.name AS provider FROM camp_provider_hotels h JOIN camp_providers p ON p.id = h.provider_id WHERE h.entity_id IS NULL`);
  const linked = [];
  for (const h of open) {
    const id = await matchEntity(h.hotel_name);
    if (!id) continue;
    await db.query('UPDATE camp_provider_hotels SET entity_id = $2 WHERE id = $1', [h.id, id]);
    linked.push({ provider: h.provider, hotel: h.hotel_name });
  }
  return linked;
}

async function forEntity(entityId) {
  return db.many(
    `SELECT DISTINCT p.id, p.slug, p.name, p.model, p.model_label, p.partner, p.lead_active
       FROM camp_provider_hotels h JOIN camp_providers p ON p.id = h.provider_id
      WHERE h.entity_id = $1 AND p.status = 'active' ORDER BY p.name`,
    [entityId]
  );
}

// Ziel der Weiterleitung: Partner-Link oder Website, mit Kampagnenkennung (nur wenn keine eigene vorhanden)
function outboundUrl(p, siteHost) {
  const target = p.partner && p.partner_url ? p.partner_url : p.website;
  try {
    const u = new URL(target);
    if (!u.searchParams.has('utm_source')) {
      u.searchParams.set('utm_source', siteHost || 'tri-hotel.de');
      u.searchParams.set('utm_medium', 'referral');
      u.searchParams.set('utm_campaign', 'trainingscamp');
    }
    return u.toString();
  } catch {
    return target;
  }
}

async function countClick(providerId) {
  await db.query(
    `INSERT INTO outbound_clicks (kind, target_id, day, clicks) VALUES ('camp', $1, current_date, 1)
     ON CONFLICT (kind, target_id, day) DO UPDATE SET clicks = outbound_clicks.clicks + 1`,
    [providerId]
  );
}

async function clickStats(siteId) {
  const rows = await db.many(
    `SELECT p.id, COALESCE(sum(c.clicks) FILTER (WHERE c.day > current_date - 30), 0)::int AS last30, COALESCE(sum(c.clicks), 0)::int AS total
       FROM camp_providers p LEFT JOIN outbound_clicks c ON c.kind = 'camp' AND c.target_id = p.id
      WHERE p.site_id = $1 GROUP BY p.id`,
    [siteId]
  );
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

module.exports = {
  matchEntity, autoLink, entityOptions, providerOptions, suggestEntity, saveProviderHotels, setEntityProviders, MODELS, FLAGS, HOTEL_VALUES, FLIGHT_VALUES, flag, parseFilters, list, regions, bySlug, hotelsOf, forEntity, outboundUrl, countClick, clickStats };
