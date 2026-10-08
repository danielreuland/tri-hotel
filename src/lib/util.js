const crypto = require('crypto');
const config = require('../config');

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function newToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: sha256(token) };
}

// IP nur gesalzen und gehasht speichern (Rate-Limit, kein Klartext).
function ipHash(ip) {
  return sha256(`${config.sessionSecret}:${ip || ''}`);
}

// Normalisierte Website (Host ohne www) für die Dublettenprüfung.
function websiteKey(url) {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

// Kampagnen- und Klick-Kennungen (Google/Meta/Microsoft-Anzeigen, Newsletter) – gehören nicht in unsere Links
const TRACKING_PARAM = /^(utm_.*|gad_.*|gclid|gclsrc|gbraid|wbraid|dclid|fbclid|msclkid|yclid|ttclid|igshid|twclid|li_fat_id|_ga|_gl|mc_cid|mc_eid|n_okw|tc_alt)$/i;

function stripTracking(search) {
  const kept = String(search || '').replace(/^\?/, '').split('&')
    .filter((p) => p && !TRACKING_PARAM.test(decodeURIComponent(p.split('=')[0])));
  return kept.length ? `?${kept.join('&')}` : '';
}

// Website-Adresse prüfen und vereinheitlichen. Trackingparameter werden entfernt –
// außer bei Buchungslinks (keepTracking), deren Parameter zur Partner-Zuordnung gehören können.
function normalizeUrl(url, { keepTracking = false } = {}) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    if (keepTracking || !u.search) return u.toString();
    return `${u.origin}${u.pathname}${stripTracking(u.search)}${u.hash}`;
  } catch {
    return null;
  }
}

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || ''));
}

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

module.exports = { slugify, sha256, newToken, ipHash, websiteKey, normalizeUrl, isEmail, MONTHS, formatDate };
