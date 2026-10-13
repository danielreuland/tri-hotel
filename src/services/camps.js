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
async function forEntity(entityId) {
  return db.many(
    `SELECT DISTINCT p.id, p.slug, p.name, p.model, p.model_label, p.partner
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

module.exports = { MODELS, FLAGS, HOTEL_VALUES, FLIGHT_VALUES, flag, parseFilters, list, regions, bySlug, hotelsOf, forEntity, outboundUrl, countClick, clickStats };
