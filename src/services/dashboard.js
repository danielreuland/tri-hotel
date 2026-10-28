// Kennzahlen für die Admin-Startseite (/admin). Alles für das Standard-Ranking der Site; Beschriftungen kommen aus dem Ranking.
const db = require('../db');
const scoring = require('./scoring');
const camps = require('./camps');
const areas = require('./areas');
const tasks = require('./tasks');
const partners = require('./partners');
const analytics = require('./analytics');

// Tagesreihe der letzten `days` Tage bis `today` (inklusive), fehlende Tage mit 0: [{ day: 'YYYY-MM-DD', ...keys }]
function daySeries(rows, days, today, keys) {
  const byDay = new Map(rows.map((r) => [new Date(r.day).toISOString().slice(0, 10), r]));
  const end = new Date(`${new Date(today).toISOString().slice(0, 10)}T00:00:00Z`);
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(end.getTime() - i * 86400000).toISOString().slice(0, 10);
    const r = byDay.get(d) || {};
    out.push({ day: d, ...Object.fromEntries(keys.map((k) => [k, Number(r[k]) || 0])) });
  }
  return out;
}

// Abdeckung je Partnerprogramm: eigener Link, Nummer übernommen (id_from), „nicht vorhanden“, fehlt
function coverage(row, liveCount) {
  const covered = row.links + row.derived + row.absent;
  return { ...row, missing: Math.max(liveCount - covered, 0), share: liveCount ? Math.round(((row.links + row.derived) / liveCount) * 100) : 0 };
}

async function load(site) {
  const ranking = await db.one(`SELECT * FROM rankings WHERE site_id = $1 AND is_default LIMIT 1`, [site.id])
    || await db.one(`SELECT * FROM rankings WHERE is_default LIMIT 1`);
  if (!ranking) return null;
  const R = ranking.id;
  const minCompl = scoring.withDefaults(ranking.formula).min_completeness;

  const [objects, subs, texts, images, reviews, campRows, leads, taskRow, taskSources, comm, programs, clickDays, topClicks, costs, apiCalls, ov] = await Promise.all([
    db.one(
      `SELECT count(*) FILTER (WHERE status = 'live')::int AS live,
              count(*) FILTER (WHERE status = 'live' AND (score IS NULL OR completeness < $2 OR ko_reason IS NOT NULL))::int AS incomplete,
              count(*) FILTER (WHERE status = 'live' AND published_at > now() - interval '7 days')::int AS live7
         FROM entity_rankings WHERE ranking_id = $1`, [R, minCompl]),
    db.one(
      `SELECT count(*) FILTER (WHERE status = 'admin_review')::int AS review,
              count(*) FILTER (WHERE status IN ('received', 'verified', 'auto_check'))::int AS pending,
              count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS new7
         FROM submissions WHERE ranking_id = $1`, [R]),
    db.one(
      `SELECT count(*) FILTER (WHERE t.status = 'published')::int AS published, count(*) FILTER (WHERE t.status = 'draft')::int AS drafts
         FROM entity_texts t JOIN entity_rankings er ON er.entity_id = t.entity_id AND er.ranking_id = t.ranking_id AND er.status = 'live'
        WHERE t.ranking_id = $1`, [R]),
    db.one(
      `SELECT count(DISTINCT er.entity_id)::int AS with_image FROM entity_rankings er JOIN entity_images i ON i.entity_id = er.entity_id
        WHERE er.ranking_id = $1 AND er.status = 'live' AND i.approved_at IS NOT NULL AND (i.valid_until IS NULL OR i.valid_until > now())`, [R]),
    db.one(
      `SELECT count(*) FILTER (WHERE status = 'published')::int AS published, count(*) FILTER (WHERE status = 'pending')::int AS pending
         FROM reviews WHERE ranking_id = $1`, [R]),
    db.many(`SELECT status, summary FROM camp_providers WHERE site_id = $1`, [site.id]),
    db.one(
      `SELECT count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS new7,
              count(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS new30,
              count(*) FILTER (WHERE status = 'confirmed')::int AS open
         FROM camp_leads WHERE site_id = $1`, [site.id]),
    db.one(
      `SELECT count(*) FILTER (WHERE status <> 'done')::int AS open, count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
              count(*) FILTER (WHERE status = 'done' AND done_at > now() - interval '7 days' AND NOT done_auto)::int AS done7,
              count(*) FILTER (WHERE status = 'done' AND done_at > now() - interval '7 days' AND done_auto)::int AS done7_auto,
              count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS new7
         FROM admin_tasks`),
    db.many(`SELECT source, count(*)::int AS n FROM admin_tasks WHERE status <> 'done' GROUP BY source ORDER BY n DESC LIMIT 6`),
    db.one(
      `SELECT (SELECT count(*) FROM mail_messages WHERE status = 'new')::int AS mail,
              (SELECT count(*) FROM contact_messages WHERE handled_at IS NULL)::int AS contact,
              (SELECT count(*) FROM inquiry_answers WHERE status = 'pending')::int
                + (SELECT count(*) FROM inquiry_feature_answers WHERE status = 'pending')::int AS answers,
              (SELECT count(*) FROM inquiries WHERE status = 'draft')::int AS inquiry_drafts,
              (SELECT count(*) FROM inquiries WHERE status = 'sent')::int AS inquiries_sent`),
    db.many(
      `WITH live AS (SELECT entity_id FROM entity_rankings WHERE ranking_id = $1 AND status = 'live')
       SELECT p.id, p.code, p.name, p.status, p.link_template, p.link_params,
              (SELECT count(*) FROM entity_links l JOIN live USING (entity_id) WHERE l.program_id = p.id AND l.kind = 'booking')::int AS links,
              (SELECT count(*) FROM live WHERE p.id_from IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM entity_links o WHERE o.entity_id = live.entity_id AND o.program_id = p.id AND o.kind = 'booking')
                  AND EXISTS (SELECT 1 FROM entity_links s JOIN partner_programs sp ON sp.id = s.program_id
                               WHERE s.entity_id = live.entity_id AND sp.code = p.id_from AND s.kind = 'booking'))::int AS derived,
              (SELECT count(*) FROM entity_link_absences a JOIN live USING (entity_id) WHERE a.program_id = p.id
                  AND NOT EXISTS (SELECT 1 FROM entity_links o WHERE o.entity_id = a.entity_id AND o.program_id = p.id AND o.kind = 'booking'))::int AS absent,
              (SELECT COALESCE(sum(c.clicks), 0) FROM outbound_clicks c JOIN entity_links l ON l.id = c.target_id
                WHERE c.kind = 'entity_link' AND l.program_id = p.id AND c.day > current_date - 7)::int AS clicks7,
              (SELECT COALESCE(sum(c.clicks), 0) FROM outbound_clicks c JOIN entity_links l ON l.id = c.target_id
                WHERE c.kind = 'entity_link' AND l.program_id = p.id AND c.day > current_date - 30)::int AS clicks30
         FROM partner_programs p WHERE p.status = 'active' ORDER BY p.sort_order, lower(p.name)`, [R]),
    db.many(
      `SELECT day, sum(clicks) FILTER (WHERE kind IN ('entity_link', 'partner_search'))::int AS partner,
              sum(clicks) FILTER (WHERE kind = 'camp')::int AS camp
         FROM outbound_clicks WHERE day > current_date - 30 GROUP BY day`),
    partners.stats(30).then((s) => s.top.slice(0, 5)),
    db.one(
      `SELECT COALESCE(sum(cost_usd) FILTER (WHERE created_at > now() - interval '7 days'), 0)::float AS week,
              COALESCE(sum(cost_usd), 0)::float AS month
         FROM llm_usage WHERE created_at > now() - interval '30 days'`),
    db.many(`SELECT service, count(*)::int AS n FROM api_usage WHERE created_at > now() - interval '30 days' GROUP BY service ORDER BY n DESC`),
    areas.overview(ranking, site.id),
  ]);

  const activeCamps = campRows.filter((c) => c.status === 'active');
  const days = daySeries(clickDays, 30, new Date(), ['partner', 'camp']);
  const sum = (list, k) => list.reduce((s, d) => s + d[k], 0);
  const campClicks = { c7: sum(days.slice(-7), 'camp'), c30: sum(days, 'camp') };
  const partnerClicks = { c7: sum(days.slice(-7), 'partner'), c30: sum(days, 'partner') };

  return {
    ranking,
    objects: { ...objects, ...subs, texts, withImage: images.with_image },
    reviews,
    camps: {
      active: activeCamps.length, review: campRows.filter((c) => c.status === 'draft').length,
      indexable: activeCamps.filter(camps.indexable).length, minWords: camps.MIN_PROFILE_WORDS, clicks: campClicks, leads,
    },
    regions: { total: ov.regions.length, indexable: ov.regions.filter((r) => r.indexable).length, countries: ov.countries.length },
    tasks: { ...taskRow, sources: taskSources.map((s) => ({ label: tasks.LABELS[s.source] || s.source, n: s.n })) },
    comm,
    // Programme ohne Provision und ohne Links (z. B. reine Suchlinks) blenden wir aus
    partners: { programs: programs.map((p) => ({ ...coverage(p, objects.live), monetized: partners.monetized(p) })).filter((p) => p.monetized || p.links > 0), clicks: partnerClicks, days, top: topClicks },
    costs: { ...costs, api: apiCalls },
    visits: await analytics.overview(site.primary_domain),
  };
}

module.exports = { load, daySeries, coverage };
