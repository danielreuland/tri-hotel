// Dashboard-Funnel: Seitenaufrufe → Objektseiten → Partner-Klicks, Seitenaufrufe → Camp-Seiten → Camp-Anfragen.
// Absolute Zahlen je Zeitraum, Anteile an der Vorstufe und an allen Seitenaufrufen, Ziel je Monat (funnel_goals, im Admin editierbar).
// Seitenaufrufe kommen aus Plausible, Klicks und Anfragen aus der eigenen Datenbank.
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

async function goals(siteId) {
  const list = await db.many('SELECT stage, monthly_goal FROM funnel_goals WHERE site_id = $1', [siteId]);
  return Object.fromEntries(list.map((g) => [g.stage, g.monthly_goal]));
}

// Ziele speichern: leer = kein Ziel. Ergebnis: gespeicherte Ziele
async function saveGoals(siteId, input) {
  const out = {};
  for (const s of STAGES) {
    const n = Math.round(Number(String(input[s.key] ?? '').replace(/\./g, '').replace(',', '.')));
    if (Number.isFinite(n) && n > 0) {
      await db.query(
        `INSERT INTO funnel_goals (site_id, stage, monthly_goal) VALUES ($1, $2, $3)
         ON CONFLICT (site_id, stage) DO UPDATE SET monthly_goal = EXCLUDED.monthly_goal, updated_at = now()`, [siteId, s.key, n]);
      out[s.key] = n;
    } else {
      await db.query('DELETE FROM funnel_goals WHERE site_id = $1 AND stage = $2', [siteId, s.key]);
    }
  }
  return out;
}

async function load(site, ranking, periodKey) {
  const range = periodRange(PERIODS[periodKey] ? periodKey : '30');
  // Objektseiten: Standard-Ranking unter /<objekttyp>/<slug>, weitere Rankings unter /rankings/<ranking>/<slug>
  const views = await analytics.pageviews(site.primary_domain, range.from, range.to, {
    entity: `event:page==/${ranking.entity_type}/**|/rankings/*/*`,
    camp: 'event:page==/trainingscamp|/trainingscamp/**',
  });
  const ok = views && !views.error;
  const counts = await db.one(
    `SELECT (SELECT COALESCE(sum(clicks), 0) FROM outbound_clicks
              WHERE kind IN ('entity_link', 'partner_search') AND day BETWEEN $2::date AND $3::date)::int AS partner_clicks,
            ((SELECT count(*) FROM camp_leads l JOIN camp_providers p ON p.id = l.provider_id
               WHERE p.site_id = $1 AND l.request_id IS NULL AND l.status <> 'rejected' AND l.created_at::date BETWEEN $2::date AND $3::date)
             + (SELECT count(*) FROM camp_requests
               WHERE site_id = $1 AND status <> 'rejected' AND created_at::date BETWEEN $2::date AND $3::date))::int AS camp_requests`,
    [site.id, range.from, range.to]);
  const values = {
    pageviews: ok ? views.total : null,
    entity_views: ok ? views.groups.entity : null,
    partner_clicks: counts.partner_clicks,
    camp_views: ok ? views.groups.camp : null,
    camp_requests: counts.camp_requests,
  };
  const labels = { entity_views: `Aufrufe ${ranking.entity_label_sg}seiten` };
  return { range, periods: PERIODS, rows: rows(values, await goals(site.id), range, labels), analytics: views ? (views.error ? 'error' : 'ok') : 'off' };
}

module.exports = { STAGES, PERIODS, periodRange, rows, goals, saveGoals, load };
