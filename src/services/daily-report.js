// Morgenbericht per Mail: Zahlen des Vortags (Europe/Berlin) je Seite aus funnel_domains. Rein intern, ohne Einfluss auf Score oder Sortierung.
// Besucher und Seitenaufrufe kommen aus Plausible, Klicks und Antworten aus der eigenen Datenbank.
const config = require('../config');
const db = require('../db');
const analytics = require('./analytics');
const funnel = require('./funnel');
const mailer = require('./mailer');
const sites = require('./sites');

const TZ = 'Europe/Berlin';
const PARTNER_KINDS = new Set(['entity_link', 'partner_search']);

// Vortag als YYYY-MM-DD nach Berliner Zeit, auch rund um die Zeitumstellung
function previousDay(now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);
  return new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
}

// Adressen, deren Postfach abgerufen wird: Eine Mail dorthin würde im Admin zur Aufgabe
function isInboxAddress(to, site = null) {
  const inbound = config.mail.inbound.provider === 'none' ? null : config.mail.inbound.imap.user;
  const norm = (a) => String(a || '').trim().toLowerCase();
  return [inbound, config.mail.replyTo, site && site.mail_reply_to].some((a) => a && norm(a) === norm(to));
}

// Zahlen je Domain zusammenführen. views/hotelViews: je Domain das Ergebnis von Plausible (null = nicht eingerichtet, { error: true })
function assemble({ domains, views, hotelViews, clickRows, answerRows }) {
  const out = domains.map((d) => ({
    domain: d.domain, label: d.label, visitors: null, pageviews: null, hotelClicks: null,
    partnerClicks: 0, campClicks: 0, answersForm: 0, answersMail: 0, analytics: 'off',
  }));
  const byDomain = new Map(out.map((r) => [r.domain, r]));
  domains.forEach((d, i) => {
    const row = out[i];
    const v = views[i];
    const h = hotelViews[i];
    row.analytics = (v && v.error) || (h && h.error) ? 'error' : v ? 'ok' : 'off';
    if (v && !v.error) Object.assign(row, { visitors: v.visitors, pageviews: v.pageviews });
    if (h && !h.error) row.hotelClicks = h.groups.entity;
  });
  for (const c of clickRows) {
    const row = byDomain.get(funnel.clickDomain(c.source, domains));
    if (!row) continue;
    if (PARTNER_KINDS.has(c.kind)) row.partnerClicks += c.n;
    else if (c.kind === 'camp') row.campClicks += c.n;
  }
  for (const a of answerRows) {
    const d = domains.find((x) => x.ranking_id && x.ranking_id === a.ranking_id) || domains[0];
    if (!d) continue;
    byDomain.get(d.domain)[a.via === 'mail' ? 'answersMail' : 'answersForm'] += a.n;
  }
  return out;
}

async function collect(day) {
  const domains = await funnel.domains();
  const site = await sites.getDefault();
  const ranking = await db.one('SELECT * FROM rankings WHERE site_id = $1 AND is_default LIMIT 1', [site.id]);
  const entity = funnel.entityFilter(ranking);
  const home = domains[0];
  const [views, hotelViews, clickRows, answerRows, optOuts] = await Promise.all([
    Promise.all(domains.map((d) => analytics.dayStats(d.domain, day))),
    // Domains ohne eigene Objektseiten (statische Seiten) verlinken auf die erste Domain: dort zählen die Aufrufe, die von ihnen kommen
    Promise.all(domains.map((d) => (d.site_id || d === home
      ? analytics.pageviews(d.domain, day, day, { entity })
      : analytics.pageviews(home.domain, day, day, { entity: `${entity};visit:source==${d.domain}` })))),
    db.many(`SELECT kind, source, sum(clicks)::int AS n FROM outbound_clicks WHERE day = $1::date GROUP BY kind, source`, [day]),
    db.many(
      `WITH span AS (SELECT $1::date::timestamp AT TIME ZONE '${TZ}' AS a, ($1::date + 1)::timestamp AT TIME ZONE '${TZ}' AS b)
       SELECT i.ranking_id, 'form' AS via, count(*)::int AS n
         FROM inquiries i, span WHERE i.answered_at >= span.a AND i.answered_at < span.b GROUP BY i.ranking_id
       UNION ALL
       SELECT i.ranking_id, 'mail' AS via, count(*)::int AS n
         FROM mail_messages m CROSS JOIN span LEFT JOIN inquiries i ON i.id = m.inquiry_id
        WHERE m.kind = 'mail' AND (m.inquiry_id IS NOT NULL OR m.entity_id IS NOT NULL) AND m.received_at >= span.a AND m.received_at < span.b
        GROUP BY i.ranking_id`, [day]),
    // Abmeldungen von E-Mails am Vortag (Abmeldelink oder im Admin eingetragen)
    db.many(
      `SELECT e.name, e.inquiry_opt_out_source AS source FROM entities e
        WHERE e.inquiry_opt_out_at >= $1::date::timestamp AT TIME ZONE '${TZ}' AND e.inquiry_opt_out_at < ($1::date + 1)::timestamp AT TIME ZONE '${TZ}'
        ORDER BY e.inquiry_opt_out_at`, [day]),
  ]);
  return { day, ranking, optOuts, sites: assemble({ domains, views, hotelViews, clickRows, answerRows }) };
}

const dayLabel = (day) => new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${day}T00:00:00Z`));

// Bericht versenden. to: Adresse (Standard DAILY_REPORT_TO), day: YYYY-MM-DD (Standard Vortag). Ergebnis: true, wenn versendet
async function send({ to = config.dailyReport.to, day = previousDay() } = {}) {
  if (!to) throw new Error('Morgenbericht: keine Empfängeradresse (DAILY_REPORT_TO)');
  const site = await sites.getDefault();
  if (isInboxAddress(to, site)) throw new Error(`Morgenbericht: ${to} wird per Abruf ins Postfach übernommen und würde eine Aufgabe erzeugen`);
  const report = await collect(day);
  const label = dayLabel(day);
  return mailer.send({
    to, template: 'daily-report', site, replyTo: to,
    data: { ...report, dayLabel: label, subject: `Morgenbericht für ${label}` },
  });
}

module.exports = { TZ, previousDay, isInboxAddress, assemble, collect, dayLabel, send };
