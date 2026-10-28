// Seitenaufrufe aus Plausible (Stats API v1) für das Admin-Dashboard. Ohne PLAUSIBLE_API_KEY oder bei Fehlern: null.
// Ergebnisse werden 10 Minuten je Site zwischengespeichert, damit das Dashboard Plausible nicht bei jedem Aufruf fragt.
const config = require('../config');

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

function apiBase() {
  if (config.plausibleApiUrl) return config.plausibleApiUrl.replace(/\/+$/, '');
  return config.plausibleSrc ? new URL(config.plausibleSrc).origin : null;
}

async function get(path, params) {
  const url = `${apiBase()}/api/v1/stats/${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${config.plausibleApiKey}` }, signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`Plausible ${path}: HTTP ${res.status}`);
  return (await res.json()).results;
}

// { week, month, days: [{ date, visitors, pageviews }], pages: [{ page, pageviews }], sources: [{ source, visitors }] }
async function overview(domain) {
  if (!config.plausibleApiKey || !apiBase() || !domain) return null;
  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  try {
    const site = { site_id: domain };
    const [week, month, days, pages, sources] = await Promise.all([
      get('aggregate', { ...site, period: '7d', metrics: 'visitors,pageviews' }),
      get('aggregate', { ...site, period: '30d', metrics: 'visitors,pageviews' }),
      get('timeseries', { ...site, period: '30d', metrics: 'visitors,pageviews' }),
      get('breakdown', { ...site, period: '7d', property: 'event:page', metrics: 'pageviews', limit: 6 }),
      get('breakdown', { ...site, period: '7d', property: 'visit:source', metrics: 'visitors', limit: 6 }),
    ]);
    const flat = (r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v && typeof v === 'object' ? v.value : v]));
    const data = { week: flat(week), month: flat(month), days, pages, sources };
    cache.set(domain, { at: Date.now(), data });
    return data;
  } catch (err) {
    console.error('[analytics]', err.message);
    return { error: true };
  }
}

module.exports = { overview };
