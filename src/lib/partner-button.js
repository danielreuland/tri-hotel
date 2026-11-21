// Partner-Button in der Rangliste (Test A/B, 21.11.2026).
// Schalter im Admin (app_settings 'partner_button'): off = aus (Standard), test = A/B nach Datum, on = immer an.
// Zuteilung serverseitig nach Kalendertag in Europe/Berlin: gerade Tage A (ohne Button), ungerade Tage B (mit Button).
// Kein Cookie, kein Local/Session Storage – alle Besucher eines Tages sehen dieselbe Variante.
// Neutralität: Nichts hier fließt in Score oder Sortierung; der Button ist für jeden Anbieter gleich.

const SETTING_KEY = 'partner_button';
const MODES = { off: 'aus', test: 'Test', on: 'immer an' };
const VARIANTS = ['A', 'B', 'on'];
const PLACEMENTS = ['ranking', 'region', 'hotelseite', 'ratgeber'];
const MAX_POSITION = 500;

// Kalendertag in Berlin als YYYY-MM-DD (unabhängig von der Zeitzone des Servers)
function berlinDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

// Variante für einen Zeitpunkt: null (aus), 'on' (immer an) oder 'A'/'B' (Test)
function variantFor(mode, date = new Date()) {
  if (mode === 'on') return 'on';
  if (mode !== 'test') return null;
  const dayOfMonth = Number(berlinDay(date).slice(8, 10));
  return dayOfMonth % 2 === 0 ? 'A' : 'B';
}

// Variante eines gespeicherten Tages (für die Auswertung „Partnerklicks gesamt je Variante-Tag“)
const variantOfDay = (isoDay) => (Number(String(isoDay).slice(8, 10)) % 2 === 0 ? 'A' : 'B');

const showsButton = (variant) => variant === 'B' || variant === 'on';

// Parameter an /go/ und an den Beacons prüfen: nur bekannte Werte, sonst leer (bzw. 0). Freie Eingaben werden nie gespeichert.
// list wird hier nur auf die Form geprüft; ob es die Region gibt, prüft die Route (validList).
function parseMeta(q = {}) {
  const one = (v) => (Array.isArray(v) ? v[0] : v);
  const placement = PLACEMENTS.includes(one(q.src)) ? one(q.src) : '';
  const p = String(one(q.pos) || '');
  const n = /^\d{1,3}$/.test(p) ? Number(p) : 0;
  const position = n >= 1 && n <= MAX_POSITION ? n : 0;
  const variant = VARIANTS.includes(one(q.v)) ? one(q.v) : '';
  const l = String(one(q.liste) || '');
  const list = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(l) && l.length <= 60 ? l : '';
  return { placement, position, variant, list };
}

// Liste gegen die tatsächlichen Listen prüfen: 'gesamt', 'land-<länder-slug>' oder eine Region der Site.
// regionExists: async (slug) => boolean; countryExists: (slug) => boolean
async function validList(list, { regionExists, countryExists }) {
  if (!list) return '';
  if (list === 'gesamt') return list;
  if (list.startsWith('land-')) return countryExists(list.slice(5)) ? list : '';
  return (await regionExists(list)) ? list : '';
}

// Rangplatz-Gruppe für die Auswertung
const positionBucket = (pos) => (!pos ? 'unbekannt' : pos <= 3 ? '1–3' : pos <= 10 ? '4–10' : '11+');

// Query-String für /go/-Links und Beacons (nur gesetzte Werte, feste Reihenfolge)
function metaQuery({ placement, position, variant, list } = {}) {
  const parts = [];
  if (placement) parts.push(`src=${placement}`);
  if (position) parts.push(`pos=${position}`);
  if (variant) parts.push(`v=${variant}`);
  if (list) parts.push(`liste=${encodeURIComponent(list)}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

// Schalter lesen/schreiben (kurz zwischengespeichert; nach dem Speichern sofort neu)
let cache = null;
const CACHE_MS = 30 * 1000;
async function mode() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.mode;
  const db = require('../db');
  let m = 'off';
  try {
    const row = await db.one('SELECT value FROM app_settings WHERE key = $1', [SETTING_KEY]);
    if (row && row.value && MODES[row.value.mode]) m = row.value.mode;
  } catch (err) {
    console.error('[partner-button] Schalter nicht lesbar, Button bleibt aus:', err.message);
  }
  cache = { mode: m, at: Date.now() };
  return m;
}

async function setMode(m, adminId) {
  if (!MODES[m]) throw new Error('Unbekannte Stellung');
  const db = require('../db');
  const before = await mode();
  await db.query(
    `INSERT INTO app_settings (key, value, updated_by) VALUES ($1, $2::jsonb, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [SETTING_KEY, JSON.stringify({ mode: m }), adminId || null]);
  cache = null;
  return { before, after: m };
}

module.exports = { SETTING_KEY, MODES, VARIANTS, PLACEMENTS, MAX_POSITION, berlinDay, variantFor, variantOfDay, showsButton, parseMeta, validList, positionBucket, metaQuery, mode, setMode };
