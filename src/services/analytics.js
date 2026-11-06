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

// Seitenaufrufe im Zeitraum (YYYY-MM-DD bis YYYY-MM-DD, je einschließlich), gesamt und je Seitengruppe.
// groups: { name: 'event:page==/hotel/**' } (Plausible-Filter). Ergebnis: { total, groups: { name: n } }, null oder { error: true }
async function pageviews(domain, from, to, groups = {}) {
  if (!config.plausibleApiKey || !apiBase() || !domain) return null;
  const key = `pv:${domain}:${from}:${to}:${JSON.stringify(groups)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.data;
  try {
    const base = { site_id: domain, period: 'custom', date: `${from},${to}`, metrics: 'pageviews' };
    const entries = Object.entries(groups);
    const [total, ...parts] = await Promise.all([get('aggregate', base), ...entries.map(([, filters]) => get('aggregate', { ...base, filters }))]);
    const val = (r) => Number(r.pageviews && typeof r.pageviews === 'object' ? r.pageviews.value : r.pageviews) || 0;
    const data = { total: val(total), groups: Object.fromEntries(entries.map(([k], i) => [k, val(parts[i])])) };
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (err) {
    console.error('[analytics]', err.message);
    return { error: true };
  }
}

// Besucher und Seitenaufrufe einer einzelnen Seite (Pfad) im Zeitraum, für die interne API (Lead-Argumente im CRM).
// Eigener, längerer Cache (Standard 6 h), damit der Hub Plausible nicht bei jedem Aufruf belastet.
// Ergebnis: { pageviews, visitors }, null (nicht eingerichtet) oder { error: true }
async function pageStats(domain, path, from, to, { cacheMs = 6 * 60 * 60 * 1000 } = {}) {
  if (!config.plausibleApiKey || !apiBase() || !domain || !path) return null;
  const key = `page:${domain}:${path}:${from}:${to}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < cacheMs) return hit.data;
  try {
    const r = await get('aggregate', { site_id: domain, period: 'custom', date: `${from},${to}`, metrics: 'visitors,pageviews', filters: `event:page==${path}` });
    const val = (v) => Number(v && typeof v === 'object' ? v.value : v) || 0;
    const data = { pageviews: val(r.pageviews), visitors: val(r.visitors) };
    // Schlüssel wechseln täglich (Zeitraum) – alte Einträge gelegentlich entfernen
    if (cache.size > 1000) for (const [k, v] of cache) if (Date.now() - v.at > cacheMs) cache.delete(k);
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (err) {
    console.error('[analytics]', err.message);
    return { error: true };
  }
}

// Unique Visitors, Besuche und Seitenaufrufe eines Tages (YYYY-MM-DD). Ergebnis: { visitors, visits, pageviews }, null oder { error: true }
async function dayStats(domain, day) {
  if (!config.plausibleApiKey || !apiBase() || !domain) return null;
  try {
    const r = await get('aggregate', { site_id: domain, period: 'custom', date: `${day},${day}`, metrics: 'visitors,visits,pageviews' });
    const val = (v) => Number(v && typeof v === 'object' ? v.value : v) || 0;
    return { visitors: val(r.visitors), visits: val(r.visits), pageviews: val(r.pageviews) };
  } catch (err) {
    console.error('[analytics]', err.message);
    return { error: true };
  }
}

module.exports = { overview, pageviews, pageStats, dayStats };
