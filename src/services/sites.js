// Sites (Mandanten): Marke, Domain, Absender, Farben, Pflichtangaben und Personas je Site.
const db = require('../db');
const config = require('../config');
const palettes = require('../lib/palettes');

const CACHE_MS = 60 * 1000;
let cache = { at: 0, sites: [] };

async function all() {
  if (Date.now() - cache.at > CACHE_MS) {
    cache = { at: Date.now(), sites: await db.many(`SELECT * FROM sites ORDER BY is_default DESC, name`) };
  }
  return cache.sites;
}

function clearCache() {
  cache.at = 0;
}

async function get(id) {
  return (await all()).find((s) => s.id === id) || null;
}

async function getDefault() {
  return (await all()).find((s) => s.is_default) || null;
}

// Host -> { site, subdomain }. Unbekannte Hosts (z. B. localhost) bekommen die Standard-Site.
async function resolveHost(host) {
  const h = String(host || '').toLowerCase();
  const sites = (await all()).filter((s) => s.status === 'active');
  const exact = sites.find((s) => s.primary_domain === h || (s.domains || []).includes(h));
  if (exact) return { site: exact, subdomain: null };
  const parent = sites.find((s) => h.endsWith(`.${s.primary_domain}`));
  if (parent) return { site: parent, subdomain: h.slice(0, -(parent.primary_domain.length + 1)) };
  return { site: (await getDefault()) || sites[0] || null, subdomain: null };
}

async function forRanking(ranking) {
  return get(ranking.site_id);
}

// Öffentliche Basis-URL einer Site. In der Entwicklung immer BASE_URL (localhost).
function urlFor(site) {
  if (!site || !config.isProd) return config.baseUrl;
  return `https://${site.primary_domain}`;
}

async function persona(siteId, role) {
  return db.one(`SELECT * FROM personas WHERE site_id = $1 AND role = $2 AND active`, [siteId, role]);
}

// Absender: "Mia · tri-hotel.de" <mia@tri-hotel.de> bzw. "tri-hotel.de" <hallo@tri-hotel.de>
function mailFrom(site, p) {
  if (!site) return config.mail.from;
  const name = p ? `${p.name} · ${site.name}` : site.name;
  return `"${name.replace(/"/g, '')}" <${(p && p.email) || site.mail_from}>`;
}

// CSS-Variablen der Site-Palette (hell + dunkel), siehe lib/palettes.js und partials/head.ejs
function themeCss(site) {
  return site ? palettes.css(site.theme) : '';
}

module.exports = { all, clearCache, get, getDefault, resolveHost, forRanking, urlFor, persona, mailFrom, themeCss };
