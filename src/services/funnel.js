// Dashboard-Funnel: Seitenaufrufe → Objektseiten → Partner-Klicks / Anfragen gestartet, Vergleiche, Seitenaufrufe → Camp-Seiten → Camp-Anfragen.
// Absolute Zahlen je Zeitraum, Anteile an der Vorstufe und an allen Seitenaufrufen, Ziel je Monat (funnel_goals, im Admin editierbar).
// Je Seite (funnel_domains, z. B. tri-hotel.de, fitnessracing-hotel.de) oder alle zusammen („alle“).
// Seitenaufrufe und Ziele kommen aus Plausible (je Domain, Filter und Zielnamen aus funnel_domains.plausible, Migration 126),
// Klicks und Anfragen aus der eigenen Datenbank.
const db = require('../db');
const analytics = require('./analytics');

// Stufen in Anzeige-Reihenfolge; parent = Vorstufe für den Anteil („von …“).
// source: total = alle Seitenaufrufe, page = Plausible-Filter (plausible.pages), goal = Plausible-Ziel (plausible.goals), db = eigene Datenbank
const STAGES = [
  { key: 'pageviews', label: 'Seitenaufrufe', parent: null, source: 'total' },
  { key: 'entity_views', label: 'Aufrufe Objektseiten', parent: 'pageviews', source: 'page' },
  { key: 'partner_clicks', label: 'Partner-Klicks', parent: 'entity_views', source: 'db' },
  { key: 'inquiry_starts', label: 'Anfragen gestartet', parent: 'entity_views', source: 'goal' },
  { key: 'compare_views', label: 'Vergleiche aufgerufen', parent: 'pageviews', source: 'goal' },
  { key: 'camp_views', label: 'Aufrufe Camp-Seiten', parent: 'pageviews', source: 'page' },
  { key: 'camp_requests', label: 'Camp-Anfragen', parent: 'camp_views', source: 'db' },
];
const PAGE_STAGES = STAGES.filter((s) => s.source === 'page').map((s) => s.key);
const GOAL_STAGES = STAGES.filter((s) => s.source === 'goal').map((s) => s.key);

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
  return db.many('SELECT domain, label, site_id, ranking_id, plausible FROM funnel_domains ORDER BY sort_order, domain');
}

// Plausible-Filter für Objektseiten: Standard-Ranking unter /<objekttyp>/<slug>, weitere Rankings unter /rankings/<ranking>/<slug>.
// Nur Rückfall für Domains der App ohne eigenen Eintrag in plausible.pages.entity_views.
const entityFilter = (ranking) => `event:page==/${ranking.entity_type}/**|/rankings/*/*`;

// Plausible-Einstellungen einer Domain (funnel_domains.plausible), mit Standardwerten
function plausibleConfig(d) {
  const p = (d && d.plausible) || {};
  return { site: p.site || d.domain, pages: p.pages || {}, goals: p.goals || {}, pagesOn: p.pages_on && p.pages_on !== d.domain ? p.pages_on : null };
}

// Abfragen einer Domain: site = Plausible-Site für alle Seitenaufrufe; groupSite = Site, auf der Seiten-Stufen und Ziele zählen
// (bei pages_on die Zieldomain, eingeschränkt auf Besuche von dieser Domain). Liegt die Zieldomain selbst in der Auswahl
// („alle zusammen“), entfallen Seiten-Stufen und Ziele dieser Domain – sie sind dort schon enthalten.
function queries(d, all, chosenSet, ranking) {
  const c = plausibleConfig(d);
  const target = c.pagesOn ? all.find((x) => x.domain === c.pagesOn) || { domain: c.pagesOn } : null;
  const groupSite = target ? plausibleConfig(target).site : c.site;
  const suffix = target ? `;visit:source==${d.domain}` : '';
  const out = { domain: d.domain, site: c.site, groupSite, pages: {}, goals: {} };
  if (target && chosenSet.has(target.domain)) return { ...out, skipped: true };
  for (const key of PAGE_STAGES) {
    const filter = c.pages[key] || (key === 'entity_views' && d.site_id && ranking ? entityFilter(ranking) : null);
    if (filter) out.pages[key] = filter + suffix;
  }
  for (const key of GOAL_STAGES) if (c.goals[key]) out.goals[key] = `event:goal==${c.goals[key]}${suffix}`;
  return out;
}

// Werte der Plausible-Stufen aus den Ergebnissen je Domain. per: queries(), totals/pages/goals: Ergebnisse von analytics je Domain
// (null = nicht abgefragt/nicht eingerichtet, { error: true }). Stufe unbekannt (null), wenn keine Domain einen Wert liefert.
function plausibleValues(per, { totals, pages, goals }) {
  const ok = (r) => r && !r.error;
  const pick = (list, key, src) => sum(per.map((q, i) => (q[src][key] && ok(list[i]) ? list[i].groups[key] : null)));
  const values = { pageviews: sum(totals.map((t) => (ok(t) ? t.total : null))) };
  for (const key of PAGE_STAGES) values[key] = pick(pages, key, 'pages');
  for (const key of GOAL_STAGES) values[key] = pick(goals, key, 'goals');
  const all = [...totals, ...pages, ...goals];
  const status = all.some((r) => r && r.error) ? 'error' : all.some(ok) ? 'ok' : 'off';
  return { values, status };
}

// Plausible-Einstellungen einer Domain aus dem Admin-Formular prüfen und speichern. Ergebnis: gespeicherte Einstellungen
const FILTER_RE = /^(event|visit):[a-z_]+(==|!=|~=)[^\n\r]+$/;
const GOAL_RE = /^[^;|\n\r]{1,120}$/;
async function savePlausible(domain, input) {
  const all = await domains();
  const d = all.find((x) => x.domain === domain);
  if (!d) throw Object.assign(new Error('Unbekannte Domain'), { status: 400 });
  const clean = (v) => String(v ?? '').trim();
  const out = { pages: {}, goals: {} };
  const site = clean(input.site);
  if (site && site !== d.domain) {
    if (!/^[a-z0-9.-]{3,253}$/i.test(site)) throw Object.assign(new Error('Plausible-Site: nur Domain-Zeichen'), { status: 400 });
    out.site = site.toLowerCase();
  }
  const on = clean(input.pages_on);
  if (on && on !== d.domain) {
    if (!all.some((x) => x.domain === on)) throw Object.assign(new Error('Zählen auf: unbekannte Domain'), { status: 400 });
    out.pages_on = on;
  }
  for (const key of PAGE_STAGES) {
    const v = clean(input.pages && input.pages[key]);
    if (!v) continue;
    if (!FILTER_RE.test(v)) throw Object.assign(new Error(`Filter „${key}“: z. B. event:page==/hotel/**`), { status: 400 });
    out.pages[key] = v;
  }
  for (const key of GOAL_STAGES) {
    const v = clean(input.goals && input.goals[key]);
    if (!v) continue;
    if (!GOAL_RE.test(v)) throw Object.assign(new Error(`Ziel „${key}“: höchstens 120 Zeichen, ohne ; und |`), { status: 400 });
    out.goals[key] = v;
  }
  await db.query('UPDATE funnel_domains SET plausible = $2 WHERE domain = $1', [domain, out]);
  return out;
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

  // Seitenaufrufe, Seiten-Stufen und Ziele je Domain aus Plausible
  const chosenSet = new Set(chosen.map((d) => d.domain));
  const per = chosen.map((d) => queries(d, all, chosenSet, ranking));
  const has = (o) => Object.keys(o).length > 0;
  const [totals, pages, goalRes] = await Promise.all([
    Promise.all(per.map((q) => analytics.pageviews(q.site, range.from, range.to, q.groupSite === q.site ? q.pages : {}))),
    Promise.all(per.map((q) => (q.groupSite !== q.site && has(q.pages) ? analytics.pageviews(q.groupSite, range.from, range.to, q.pages, { total: false }) : null))),
    Promise.all(per.map((q) => (has(q.goals) ? analytics.events(q.groupSite, range.from, range.to, q.goals) : null))),
  ]);
  // Seiten-Stufen auf der eigenen Site stecken im Ergebnis der Gesamtzahl
  const pageRes = pages.map((p, i) => (per[i].groupSite === per[i].site ? totals[i] : p));
  const { values: pv, status } = plausibleValues(per, { totals, pages: pageRes, goals: goalRes });

  // Partner-Klicks nach Herkunft, der Domain zugeordnet
  const clickRows = await db.many(
    `SELECT source, sum(clicks)::int AS n FROM outbound_clicks
      WHERE kind IN ('entity_link', 'partner_search', 'guide_link') AND day BETWEEN $1::date AND $2::date GROUP BY source`, [range.from, range.to]);
  const partnerClicks = clickRows.filter((r) => chosenSet.has(clickDomain(r.source, all))).reduce((a, r) => a + r.n, 0);

  // Camp-Anfragen nur auf Domains, die die App ausliefert (dort gibt es die Formulare)
  const siteIds = [...new Set(chosen.map((d) => d.site_id).filter(Boolean))];
  const requests = siteIds.length ? (await db.one(
    `SELECT ((SELECT count(*) FROM camp_leads l JOIN camp_providers p ON p.id = l.provider_id
               WHERE p.site_id = ANY($1::uuid[]) AND l.request_id IS NULL AND l.status <> 'rejected' AND l.created_at::date BETWEEN $2::date AND $3::date)
             + (SELECT count(*) FROM camp_requests
               WHERE site_id = ANY($1::uuid[]) AND status <> 'rejected' AND created_at::date BETWEEN $2::date AND $3::date))::int AS n`,
    [siteIds, range.from, range.to])).n : null;

  const values = { ...pv, partner_clicks: partnerClicks, camp_requests: requests };
  const labels = { entity_views: `Aufrufe ${ranking.entity_label_sg}seiten` };
  const scopes = [...all.map((d) => ({ key: d.domain, label: d.label })), ...(all.length > 1 ? [{ key: ALL, label: 'alle zusammen' }] : [])];
  const single = scope === ALL ? null : chosen[0];
  return {
    range, periods: PERIODS, scope, scopes, domains: all.map((d) => d.domain), pageStages: PAGE_STAGES, goalStages: GOAL_STAGES,
    rows: rows(values, await goals(site.id, scope), range, labels), analytics: status,
    // Einstellungen der gewählten Domain fürs Admin-Formular (bei „alle zusammen“ nicht editierbar)
    plausible: single ? { domain: single.domain, ...(single.plausible || {}) } : null,
  };
}

module.exports = {
  STAGES, PAGE_STAGES, GOAL_STAGES, PERIODS, ALL, periodRange, rows, clickDomain, scopeOf, sum, domains, entityFilter,
  plausibleConfig, queries, plausibleValues, savePlausible, goals, saveGoals, load,
};
