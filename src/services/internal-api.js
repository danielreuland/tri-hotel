// Interne API v1 für den Hub danielreuland.com (Vertrag: docs/internal-api.md). Nur lesend.
// Datensparsam: keine Daten von Nutzern der Seite (Melder, Bewerter, Anfragende, Camp-Leads, Antwortende) –
// nur Unternehmensdaten mit Quelle und reine Zahlen. Nichts hier wirkt auf Score oder Reihenfolge zurück.
const db = require('../db');
const sites = require('./sites');
const partners = require('./partners');
const analytics = require('./analytics');
const seo = require('../lib/seo');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE_CACHE_MS = 6 * 60 * 60 * 1000;

const iso = (d) => (d ? new Date(d).toISOString() : null);
const num = (v) => (v === null || v === undefined ? null : Number(v));
const share = (pct) => (pct === null || pct === undefined ? null : Math.round(Number(pct) * 10) / 1000); // 86.00 % -> 0.86
const siteUrl = (domain) => sites.urlFor(domain ? { primary_domain: domain } : null);
const likePattern = (q) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// Zeitraum der letzten `days` Tage bis heute (je einschließlich), wie die Klickzählung (day > current_date - days)
function period(days, today = new Date()) {
  const to = new Date(`${today.toISOString().slice(0, 10)}T00:00:00Z`);
  const from = new Date(to.getTime() - (days - 1) * 86400000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// Pfad der öffentlichen Objektseite je Ranking (wie routes/public.js)
function entityPath(r, slug) {
  return r.isDefault ? `/${r.entityType}/${slug}` : `/rankings/${r.rankingSlug}/${slug}`;
}

// --- Abbildung DB-Zeile -> Vertrag --------------------------------------------------------------------------------

function rankingOut(r, slug) {
  return {
    code: r.code, name: r.name, site: r.domain, status: r.status,
    score: num(r.score), provisional: Boolean(r.provisional), completeness: share(r.completeness),
    url: r.status === 'live' ? `${siteUrl(r.domain)}${entityPath(r, slug)}` : null,
  };
}

function entitySummary(row) {
  return {
    id: row.id, name: row.name, city: row.city || null, country: row.country || null, type: row.entity_type,
    website: row.website || null, rankings: (row.rankings || []).map((r) => rankingOut(r, row.slug)), updatedAt: iso(row.updated_at),
  };
}

function addressOut(row) {
  const a = (row.attributes || {}).address || {};
  const city = a.city || row.city || null;
  const line2 = [a.postal_code, city].filter(Boolean).join(' ');
  const text = [a.street, line2, row.country ? seo.countryName(row.country) : null].filter(Boolean).join(', ');
  return { street: a.street || null, postalCode: a.postal_code || null, city, country: row.country || null, text: text || null };
}

function contactOut({ email, phone = null, source, evidence }) {
  if (!email && !phone) return null;
  return { email: email || null, phone: phone || null, source: source || null, evidence: evidence || null };
}

function entityDetail(row, region) {
  return {
    ...entitySummary(row),
    address: addressOut(row),
    region: region ? { slug: region.slug, name: region.name, site: region.domain } : null,
    contact: contactOut({ email: row.contact_email, source: row.contact_email_source, evidence: row.contact_email_evidence }),
  };
}

function campSummary(row) {
  return {
    id: row.id, name: row.name, site: row.domain, status: row.status, seat: row.seat || null, website: row.website || null,
    url: row.status === 'active' ? `${siteUrl(row.domain)}/trainingscamp/anbieter/${row.slug}` : null, updatedAt: iso(row.updated_at),
  };
}

function campDetail(row) {
  return {
    ...campSummary(row), model: row.model, regions: row.regions || [],
    contact: contactOut({ email: row.contact_email, phone: row.contact_phone, source: row.contact_source, evidence: row.contact_evidence }),
    leadActive: Boolean(row.lead_active),
  };
}

function coverage(row) {
  const covered = row.links + row.derived + row.absent;
  return {
    live: row.live, links: row.links, derived: row.derived, absent: row.absent,
    missing: Math.max(row.live - covered, 0), share: row.live ? Math.round(((row.links + row.derived) / row.live) * 100) : 0,
  };
}

function programOut(row) {
  return {
    code: row.code, name: row.name, status: row.status, monetized: partners.monetized(row), directLink: Boolean(row.direct_link),
    coverage: coverage(row), clicks: { d7: row.clicks7, d30: row.clicks30 },
  };
}

// --- Abfragen -----------------------------------------------------------------------------------------------------

const ENTITY_SELECT = `
  SELECT e.id, e.name, e.city, e.country, e.entity_type, e.website, e.slug, e.lat, e.lng, e.attributes, e.updated_at,
         e.contact_email, e.contact_email_source, e.contact_email_evidence,
         COALESCE((SELECT json_agg(json_build_object(
                    'code', r.code, 'name', r.name, 'rankingSlug', r.slug, 'isDefault', r.is_default, 'entityType', r.entity_type,
                    'siteId', r.site_id, 'domain', s.primary_domain, 'status', er.status, 'score', er.score,
                    'provisional', er.is_provisional, 'completeness', er.completeness) ORDER BY r.is_default DESC, r.code)
                     FROM entity_rankings er JOIN rankings r ON r.id = er.ranking_id JOIN sites s ON s.id = r.site_id
                    WHERE er.entity_id = e.id), '[]'::json) AS rankings
    FROM entities e`;

async function searchEntities(q, limit) {
  const rows = await db.many(
    `${ENTITY_SELECT} WHERE e.name ILIKE $1 OR e.city ILIKE $1 ORDER BY lower(e.name), e.id LIMIT $2`, [likePattern(q), limit]);
  return rows.map(entitySummary);
}

async function entitiesByIds(ids) {
  const rows = await db.many(`${ENTITY_SELECT} WHERE e.id = ANY($1::uuid[]) ORDER BY lower(e.name), e.id`, [ids]);
  return rows.map(entitySummary);
}

// Erste aktive Trainingsregion (Site der Rankings in deren Reihenfolge), in der das Objekt liegt
async function regionOf(row) {
  const siteIds = [...new Set((row.rankings || []).map((r) => r.siteId))];
  if (!siteIds.length || row.lat === null || row.lat === undefined) return null;
  const regions = await db.many(
    `SELECT g.slug, g.name, g.lat, g.lng, g.radius_km, g.site_id, s.primary_domain AS domain
       FROM regions g JOIN sites s ON s.id = g.site_id
      WHERE g.site_id = ANY($1::uuid[]) AND g.status = 'active' ORDER BY g.sort_order, g.name`, [siteIds]);
  for (const siteId of siteIds) {
    const hit = regions.find((g) => g.site_id === siteId && seo.inRegion(row, g));
    if (hit) return hit;
  }
  return null;
}

async function entity(id) {
  const row = await db.one(`${ENTITY_SELECT} WHERE e.id = $1`, [id]);
  if (!row) return null;
  return entityDetail(row, await regionOf(row));
}

// Seitenaufrufe einer Seite im Zeitraum (Plausible, 6 h gecacht): { pageviews, visitors } oder null
async function pageStats(domain, path, range) {
  const r = await analytics.pageStats(domain, path, range.from, range.to, { cacheMs: PAGE_CACHE_MS });
  return r && !r.error ? r : null;
}

// Summe über mehrere Seiten; null, sobald eine Seite keine Zahlen hat (Plausible aus/gestört)
function sumPages(pages) {
  if (!pages.length || pages.some((p) => p.pageviews === null)) return { pageviews: pages.length ? null : 0, visitors: pages.length ? null : 0 };
  return { pageviews: pages.reduce((s, p) => s + p.pageviews, 0), visitors: pages.reduce((s, p) => s + p.visitors, 0) };
}

async function entityMetrics(id, days, now = new Date()) {
  const row = await db.one(`${ENTITY_SELECT} WHERE e.id = $1`, [id]);
  if (!row) return null;
  const range = period(days, now);
  const live = (row.rankings || []).filter((r) => r.status === 'live');
  const [pages, clicks, inquiry] = await Promise.all([
    Promise.all(live.map(async (r) => {
      const path = entityPath(r, row.slug);
      const s = await pageStats(r.domain, path, range);
      return { site: r.domain, path, pageviews: s ? s.pageviews : null, visitors: s ? s.visitors : null };
    })),
    db.many(
      `SELECT p.code AS program, p.name, sum(c.clicks)::int AS clicks
         FROM outbound_clicks c JOIN entity_links l ON l.id = c.target_id JOIN partner_programs p ON p.id = l.program_id
        WHERE c.kind = 'entity_link' AND l.entity_id = $1 AND c.day > current_date - $2::int
        GROUP BY p.code, p.name, p.sort_order HAVING sum(c.clicks) > 0 ORDER BY clicks DESC, p.sort_order`, [id, days]),
    db.one(
      `SELECT status, sent_at, answered_at FROM inquiries WHERE entity_id = $1 AND status <> 'draft' ORDER BY created_at DESC LIMIT 1`, [id]),
  ]);
  const main = (row.rankings || [])[0];
  return {
    id: row.id, days, ...range, ...sumPages(pages), pages,
    partnerClicks: clicks.map((c) => ({ program: c.program, name: c.name, clicks: c.clicks })),
    inquiry: inquiry ? { status: inquiry.status, sentAt: iso(inquiry.sent_at), answeredAt: iso(inquiry.answered_at) } : null,
    completeness: main ? share(main.completeness) : null,
    rankings: (row.rankings || []).map((r) => ({ code: r.code, site: r.domain, status: r.status, score: num(r.score), completeness: share(r.completeness) })),
    generatedAt: now.toISOString(),
  };
}

const CAMP_SELECT = `
  SELECT p.id, p.name, p.slug, p.status, p.seat, p.website, p.model, p.regions, p.updated_at, p.lead_active,
         p.contact_email, p.contact_phone, p.contact_source, p.contact_evidence, s.primary_domain AS domain
    FROM camp_providers p JOIN sites s ON s.id = p.site_id`;

async function searchCampProviders(q, limit) {
  const rows = await db.many(`${CAMP_SELECT} WHERE p.name ILIKE $1 OR p.seat ILIKE $1 ORDER BY lower(p.name), p.id LIMIT $2`, [likePattern(q), limit]);
  return rows.map(campSummary);
}

async function campProvidersByIds(ids) {
  return (await db.many(`${CAMP_SELECT} WHERE p.id = ANY($1::uuid[]) ORDER BY lower(p.name), p.id`, [ids])).map(campSummary);
}

async function campProvider(id) {
  const row = await db.one(`${CAMP_SELECT} WHERE p.id = $1`, [id]);
  return row ? campDetail(row) : null;
}

async function campProviderMetrics(id, days, now = new Date()) {
  const row = await db.one(`${CAMP_SELECT} WHERE p.id = $1`, [id]);
  if (!row) return null;
  const range = period(days, now);
  const [views, clicks, requests, byMonth] = await Promise.all([
    row.status === 'active' ? pageStats(row.domain, `/trainingscamp/anbieter/${row.slug}`, range) : Promise.resolve({ pageviews: 0, visitors: 0 }),
    db.one(`SELECT COALESCE(sum(clicks), 0)::int AS n FROM outbound_clicks WHERE kind = 'camp' AND target_id = $1 AND day > current_date - $2::int`, [id, days]),
    // nur Zahlen, keine Daten der Anfragenden
    db.one(
      `SELECT count(*)::int AS total, count(confirmed_at)::int AS confirmed, count(forwarded_at)::int AS forwarded
         FROM camp_leads WHERE provider_id = $1 AND created_at >= current_date - ($2::int - 1)`, [id, days]),
    db.many(
      `SELECT to_char(m, 'YYYY-MM') AS month, count(l.id)::int AS total, count(l.confirmed_at)::int AS confirmed,
              count(l.forwarded_at)::int AS forwarded
         FROM generate_series(date_trunc('month', current_date) - interval '11 months', date_trunc('month', current_date), interval '1 month') m
         LEFT JOIN camp_leads l ON l.provider_id = $1 AND date_trunc('month', l.created_at) = m
        GROUP BY m ORDER BY m`, [id]),
  ]);
  return {
    id: row.id, days, ...range, pageviews: views ? views.pageviews : null, visitors: views ? views.visitors : null, clicks: clicks.n,
    campRequests: { ...requests, byMonth },
    generatedAt: now.toISOString(),
  };
}

async function partnerPrograms(now = new Date()) {
  const rows = await db.many(
    `WITH live AS (SELECT DISTINCT entity_id FROM entity_rankings WHERE status = 'live')
     SELECT p.code, p.name, p.status, p.link_template, p.link_params, p.direct_link,
            (SELECT count(*) FROM live)::int AS live,
            (SELECT count(DISTINCT l.entity_id) FROM entity_links l JOIN live USING (entity_id) WHERE l.program_id = p.id AND l.kind = 'booking')::int AS links,
            (SELECT count(*) FROM live WHERE p.id_from IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM entity_links o WHERE o.entity_id = live.entity_id AND o.program_id = p.id AND o.kind = 'booking')
                AND EXISTS (SELECT 1 FROM entity_links s JOIN partner_programs sp ON sp.id = s.program_id
                             WHERE s.entity_id = live.entity_id AND sp.code = p.id_from AND s.kind = 'booking'))::int AS derived,
            (SELECT count(*) FROM entity_link_absences a JOIN live USING (entity_id) WHERE a.program_id = p.id
                AND NOT EXISTS (SELECT 1 FROM entity_links o WHERE o.entity_id = a.entity_id AND o.program_id = p.id AND o.kind = 'booking'))::int AS absent,
            (SELECT COALESCE(sum(c.clicks), 0) FROM outbound_clicks c LEFT JOIN entity_links l ON c.kind = 'entity_link' AND l.id = c.target_id
              WHERE ((c.kind = 'entity_link' AND l.program_id = p.id) OR (c.kind = 'partner_search' AND c.target_id = p.id))
                AND c.day > current_date - 7)::int AS clicks7,
            (SELECT COALESCE(sum(c.clicks), 0) FROM outbound_clicks c LEFT JOIN entity_links l ON c.kind = 'entity_link' AND l.id = c.target_id
              WHERE ((c.kind = 'entity_link' AND l.program_id = p.id) OR (c.kind = 'partner_search' AND c.target_id = p.id))
                AND c.day > current_date - 30)::int AS clicks30
       FROM partner_programs p ORDER BY p.sort_order, lower(p.name)`);
  return { items: rows.map(programOut), generatedAt: now.toISOString() };
}

// Besucher 7/30 Tage aus Plausible (Cache in analytics.js); null, wenn nicht eingerichtet oder gestört
function visitsOut(ov) {
  if (!ov || ov.error || !ov.week || !ov.month) return null;
  return { d7: Number(ov.week.visitors) || 0, d30: Number(ov.month.visitors) || 0 };
}

async function stats(now = new Date()) {
  const [rows, totals] = await Promise.all([
    db.many(
      `SELECT s.code, s.name, s.primary_domain AS domain, s.status,
              (SELECT count(DISTINCT er.entity_id) FROM entity_rankings er JOIN rankings r ON r.id = er.ranking_id
                WHERE r.site_id = s.id AND er.status = 'live')::int AS live,
              (SELECT count(*) FROM submissions su JOIN rankings r ON r.id = su.ranking_id
                WHERE r.site_id = s.id AND su.status = 'admin_review')::int AS review,
              (SELECT count(*) FROM camp_providers p WHERE p.site_id = s.id AND p.status = 'active')::int AS camps_active,
              -- Camp-Anfragen: Suchanfragen (camp_requests) + direkte Anfragen an einen Anbieter (camp_leads ohne Suchanfrage)
              ((SELECT count(*) FROM camp_requests q WHERE q.site_id = s.id AND q.created_at > now() - interval '7 days')
                + (SELECT count(*) FROM camp_leads l WHERE l.site_id = s.id AND l.request_id IS NULL AND l.created_at > now() - interval '7 days'))::int AS requests7,
              ((SELECT count(*) FROM camp_requests q WHERE q.site_id = s.id AND q.created_at > now() - interval '30 days')
                + (SELECT count(*) FROM camp_leads l WHERE l.site_id = s.id AND l.request_id IS NULL AND l.created_at > now() - interval '30 days'))::int AS requests30
         FROM sites s ORDER BY s.is_default DESC, s.name`),
    db.one(
      `SELECT (SELECT count(*) FROM admin_tasks WHERE status <> 'done')::int AS tasks_open,
              COALESCE(sum(clicks) FILTER (WHERE kind IN ('entity_link', 'partner_search') AND day > current_date - 7), 0)::int AS partner7,
              COALESCE(sum(clicks) FILTER (WHERE kind IN ('entity_link', 'partner_search')), 0)::int AS partner30,
              COALESCE(sum(clicks) FILTER (WHERE kind = 'camp' AND day > current_date - 7), 0)::int AS camp7,
              COALESCE(sum(clicks) FILTER (WHERE kind = 'camp'), 0)::int AS camp30
         FROM outbound_clicks WHERE day > current_date - 30`),
  ]);
  const visits = await Promise.all(rows.map((s) => (s.status === 'active' ? analytics.overview(s.domain) : null)));
  return statsOut(rows, totals, visits, now);
}

function statsOut(rows, totals, visits, now) {
  return {
    sites: rows.map((s, i) => ({
      code: s.code, name: s.name, domain: s.domain, status: s.status,
      objects: { live: s.live, review: s.review }, camps: { active: s.camps_active },
      campRequests: { d7: s.requests7, d30: s.requests30 }, visits: visitsOut(visits[i]),
    })),
    totals: {
      tasks: { open: totals.tasks_open },
      partnerClicks: { d7: totals.partner7, d30: totals.partner30 },
      campClicks: { d7: totals.camp7, d30: totals.camp30 },
    },
    generatedAt: now.toISOString(),
  };
}

module.exports = {
  UUID_RE, period, entityPath, rankingOut, entitySummary, entityDetail, addressOut, contactOut, campSummary, campDetail,
  coverage, programOut, visitsOut, sumPages, statsOut,
  searchEntities, entitiesByIds, entity, entityMetrics, searchCampProviders, campProvidersByIds, campProvider, campProviderMetrics,
  partnerPrograms, stats,
};
