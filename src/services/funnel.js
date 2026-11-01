// Dashboard-Funnel: Seitenaufrufe → Objektseiten → Partner-Klicks, Seitenaufrufe → Camp-Seiten → Camp-Anfragen.
// Absolute Zahlen je Zeitraum, Anteile an der Vorstufe und an allen Seitenaufrufen, Ziel je Monat (funnel_goals, im Admin editierbar).
// Je Seite (funnel_domains, z. B. tri-hotel.de, fitnessracing-hotel.de) oder alle zusammen („alle“).
// Seitenaufrufe kommen aus Plausible (je Domain), Klicks und Anfragen aus der eigenen Datenbank.
const db = require('../db');
const analytics = require('./analytics');

// Stufen in Anzeige-Reihenfolge; parent = Vorstufe für den Anteil („von …“)
const STAGES = [
  { key: 'pageviews', label: 'Seitenaufrufe', parent: null },
  { key: 'entity_views', label: 'Aufrufe Objektseiten', parent: 'pageviews' },
  { key: 'partner_clicks', label: 'Partner-Klicks', parent: 'entity_views' },
  { key: 'camp_views', label: 'Aufrufe Camp-Seiten', parent: 'pageviews' },
  { key: 'camp_requests', label: 'Camp-Anfragen', parent: 'camp_views' },
];

const PERIODS = { gestern: 'gestern', '7': '7 Tage', '30': '30 Tage', monat: 'dieser Monat' };
const DAY_MS = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);

// Zeitraum (UTC-Tage, je einschließlich). Ziele sind Monatsziele: anteilig mit days / 30, im laufenden Monat mit Hochrechnung.
function periodRange(key, now = new Date()) {
  const today = new Date(`${iso(now)}T00:00:00Z`);
  if (key === 'gestern') {
    const y = new Date(today.getTime() - DAY_MS);
    return { key, label: PERIODS[key], from: iso(y), to: iso(y), days: 1, goalFactor: 1 / 30 };
  }
  if (key === 'monat') {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const monthDays = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate();
    const elapsed = today.getUTCDate();
    return { key, label: PERIODS[key], from: iso(first), to: iso(today), days: elapsed, goalFactor: 1, projectTo: monthDays };
  }
  const days = key === '7' ? 7 : 30;
  return { key: String(days), label: PERIODS[String(days)], from: iso(new Date(today.getTime() - (days - 1) * DAY_MS)), to: iso(today), days, goalFactor: days / 30 };
}

const pct = (a, b) => (a === null || b === null || !b ? null : Math.round((a / b) * 1000) / 10);

// Zeilen für die Anzeige. values: { stage: Zahl | null (unbekannt) }, goals: { stage: Monatsziel }
function rows(values, goals, range, labels = {}) {
  return STAGES.map((s) => {
    const value = values[s.key] === undefined ? null : values[s.key];
    const monthly = goals[s.key] || null;
    const goal = monthly ? Math.round(monthly * range.goalFactor) : null;
    // Hochrechnung nur im laufenden Monat: Ist / vergangene Tage × Tage des Monats
    const projection = value !== null && range.projectTo ? Math.round((value / range.days) * range.projectTo) : null;
    return {
      ...s,
      label: labels[s.key] || s.label,
      value,
      goal,
      monthlyGoal: monthly,
      goalPct: pct(projection ?? value, goal),
      projection,
      ofParent: s.parent ? pct(value, values[s.parent] ?? null) : null,
      parentLabel: s.parent ? labels[s.parent] || STAGES.find((x) => x.key === s.parent).label : null,
      ofTop: s.key === 'pageviews' ? null : pct(value, values.pageviews ?? null),
    };
  });
}

const ALL = 'alle';

// Domain, der ein Partner-Klick zugeordnet wird: Herkunft (outbound_clicks.source) = eine der Funnel-Domains, sonst die erste
// Domain (eigene Seiten, „direkt“, unbekannt, vor der Herkunftserfassung). domains: [{ domain }] in Anzeige-Reihenfolge
function clickDomain(source, domains) {
  const src = String(source || '').toLowerCase().replace(/^www\./, '');
  const hit = domains.find((d) => d.domain === src);
  return hit ? hit.domain : domains.length ? domains[0].domain : null;
}

// Gewählte Seite: eine Domain aus der Liste oder „alle“; Standard ist die erste Domain
function scopeOf(key, domains) {
  if (key === ALL && domains.length > 1) return ALL;
  return domains.some((d) => d.domain === key) ? key : domains.length ? domains[0].domain : ALL;
}

async function domains() {
  return db.many('SELECT domain, label, site_id FROM funnel_domains ORDER BY sort_order, domain');
}

async function goals(siteId, scope) {
  const list = await db.many('SELECT stage, monthly_goal FROM funnel_goals WHERE site_id = $1 AND scope = $2', [siteId, scope]);
  return Object.fromEntries(list.map((g) => [g.stage, g.monthly_goal]));
}

// Ziele einer Seite speichern: leer = kein Ziel. Ergebnis: gespeicherte Ziele
async function saveGoals(siteId, scopeKey, input) {
  const scope = scopeOf(scopeKey, await domains());
  const out = {};
  for (const s of STAGES) {
    const n = Math.round(Number(String(input[s.key] ?? '').replace(/\./g, '').replace(',', '.')));
    if (Number.isFinite(n) && n > 0) {
      await db.query(
        `INSERT INTO funnel_goals (site_id, scope, stage, monthly_goal) VALUES ($1, $2, $3, $4)
         ON CONFLICT (site_id, scope, stage) DO UPDATE SET monthly_goal = EXCLUDED.monthly_goal, updated_at = now()`, [siteId, scope, s.key, n]);
      out[s.key] = n;
    } else {
      await db.query('DELETE FROM funnel_goals WHERE site_id = $1 AND scope = $2 AND stage = $3', [siteId, scope, s.key]);
    }
  }
  return { scope, goals: out };
}

// Zahlen mehrerer Seiten addieren; null (unbekannt) nur, wenn keine Seite einen Wert hat
function sum(list) {
  const known = list.filter((v) => v !== null && v !== undefined);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
}

async function load(site, ranking, periodKey, scopeKey) {
  const range = periodRange(PERIODS[periodKey] ? periodKey : '30');
  const all = await domains();
  const scope = scopeOf(scopeKey, all);
  const chosen = scope === ALL ? all : all.filter((d) => d.domain === scope);

  // Seitenaufrufe je Domain. Objektseiten: Standard-Ranking unter /<objekttyp>/<slug>, weitere Rankings unter /rankings/<ranking>/<slug>
  const groups = { entity: `event:page==/${ranking.entity_type}/**|/rankings/*/*`, camp: 'event:page==/trainingscamp|/trainingscamp/**' };
  const views = await Promise.all(chosen.map((d) => analytics.pageviews(d.domain, range.from, range.to, groups)));
  const okViews = views.filter((v) => v && !v.error);
  const status = views.some((v) => v && v.error) ? 'error' : okViews.length ? 'ok' : 'off';

  // Partner-Klicks nach Herkunft, der Domain zugeordnet
  const clickRows = await db.many(
    `SELECT source, sum(clicks)::int AS n FROM outbound_clicks
      WHERE kind IN ('entity_link', 'partner_search') AND day BETWEEN $1::date AND $2::date GROUP BY source`, [range.from, range.to]);
  const chosenSet = new Set(chosen.map((d) => d.domain));
  const partnerClicks = clickRows.filter((r) => chosenSet.has(clickDomain(r.source, all))).reduce((a, r) => a + r.n, 0);

  // Camp-Anfragen nur auf Domains, die die App ausliefert (dort gibt es die Formulare)
  const siteIds = [...new Set(chosen.map((d) => d.site_id).filter(Boolean))];
  const requests = siteIds.length ? (await db.one(
    `SELECT ((SELECT count(*) FROM camp_leads l JOIN camp_providers p ON p.id = l.provider_id
               WHERE p.site_id = ANY($1::uuid[]) AND l.request_id IS NULL AND l.status <> 'rejected' AND l.created_at::date BETWEEN $2::date AND $3::date)
             + (SELECT count(*) FROM camp_requests
               WHERE site_id = ANY($1::uuid[]) AND status <> 'rejected' AND created_at::date BETWEEN $2::date AND $3::date))::int AS n`,
    [siteIds, range.from, range.to])).n : null;

  const values = {
    pageviews: sum(okViews.map((v) => v.total)),
    entity_views: sum(okViews.map((v) => v.groups.entity)),
    partner_clicks: partnerClicks,
    camp_views: sum(okViews.map((v) => v.groups.camp)),
    camp_requests: requests,
  };
  const labels = { entity_views: `Aufrufe ${ranking.entity_label_sg}seiten` };
  const scopes = [...all.map((d) => ({ key: d.domain, label: d.label })), ...(all.length > 1 ? [{ key: ALL, label: 'alle zusammen' }] : [])];
  return {
    range, periods: PERIODS, scope, scopes,
    rows: rows(values, await goals(site.id, scope), range, labels), analytics: status,
  };
}

module.exports = { STAGES, PERIODS, ALL, periodRange, rows, clickDomain, scopeOf, sum, domains, goals, saveGoals, load };
