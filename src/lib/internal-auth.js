// Signaturen der internen API (tri-hotel ↔ Hub), Vertrag: docs/internal-api.md. Reine Funktionen ohne Datenbank.
// kanon = `${ts}\n${METHOD}\n${pfad_mit_query}\n${hex(sha256(body))}` (+ `\n${nonce}`, falls eine Nonce mitgeschickt wird)
const crypto = require('crypto');

const WINDOW_S = 300;
const APP_RE = /^[a-z0-9-]{1,32}$/;
const NONCE_RE = /^[A-Za-z0-9-]{16,64}$/;
const MIN_SECRET_BYTES = 32;

const sha256Hex = (body) => crypto.createHash('sha256').update(body === undefined || body === null ? '' : body).digest('hex');

function canonical({ timestamp, method, path, body = '', nonce = null }) {
  const parts = [String(timestamp), String(method).toUpperCase(), path, sha256Hex(body)];
  if (nonce) parts.push(nonce);
  return parts.join('\n');
}

function sign(secret, req) {
  return crypto.createHmac('sha256', secret).update(canonical(req)).digest('hex');
}

// Header für einen ausgehenden Aufruf (Hub-Client, Testskript, Ereignis-Sender)
function headers({ app, secret, method, path, body = '', nonce = null, now = Date.now() }) {
  const timestamp = Math.floor(now / 1000);
  const h = { 'X-Internal-App': app, 'X-Internal-Timestamp': String(timestamp) };
  if (nonce) h['X-Internal-Nonce'] = nonce;
  h['X-Internal-Signature'] = sign(secret, { timestamp, method, path, body, nonce });
  return h;
}

// "hub:<geheimnis>,hub:<alt>,triprep:<…>" -> Map(app -> [geheimnisse]). Mehrere Einträge je App = Schlüsselwechsel.
// Ungültige Einträge (ohne Namen, zu kurz) werden mit Hinweis übersprungen, nie samt Geheimnis ausgegeben.
function parseKeys(raw, { warn = (m) => console.warn(m) } = {}) {
  const keys = new Map();
  for (const entry of String(raw || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const i = entry.indexOf(':');
    const app = i > 0 ? entry.slice(0, i).trim() : '';
    const secret = i > 0 ? entry.slice(i + 1).trim() : '';
    if (!APP_RE.test(app)) {
      warn('[internal-auth] INTERNAL_API_KEYS: Eintrag ohne gültigen App-Namen übersprungen');
      continue;
    }
    if (Buffer.byteLength(secret) < MIN_SECRET_BYTES) {
      warn(`[internal-auth] INTERNAL_API_KEYS: Geheimnis für „${app}“ zu kurz (mind. ${MIN_SECRET_BYTES} Zeichen), übersprungen`);
      continue;
    }
    if (!keys.has(app)) keys.set(app, []);
    keys.get(app).push(secret);
  }
  return keys;
}

const timingSafeHexEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || !/^[0-9a-f]{64}$/.test(a) || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
};

// Prüft eine eingehende Anfrage. headers: Kleinbuchstaben-Schlüssel (wie req.headers).
// Ergebnis: { ok: true, app } oder { ok: false, reason } – reason nur fürs Protokoll, nie an den Aufrufer.
function verify({ keys, headers: h, method, path, body = '', now = Date.now(), requireNonce = false }) {
  const app = h['x-internal-app'];
  const ts = h['x-internal-timestamp'];
  const sig = String(h['x-internal-signature'] || '').toLowerCase();
  const nonce = h['x-internal-nonce'] || null;
  if (!app || !ts || !sig) return { ok: false, reason: 'missing_headers' };
  if (!APP_RE.test(app)) return { ok: false, reason: 'bad_app' };
  if (!/^\d{1,12}$/.test(ts)) return { ok: false, reason: 'bad_timestamp' };
  if (Math.abs(Math.floor(now / 1000) - Number(ts)) > WINDOW_S) return { ok: false, reason: 'expired' };
  if (nonce !== null && !NONCE_RE.test(nonce)) return { ok: false, reason: 'bad_nonce' };
  if (requireNonce && !nonce) return { ok: false, reason: 'missing_nonce' };
  const secrets = keys.get(app);
  if (!secrets || !secrets.length) return { ok: false, reason: 'unknown_app' };
  // alle Schlüssel prüfen (kein frühes Ende), damit die Laufzeit nicht verrät, welcher passt
  let match = false;
  for (const secret of secrets) {
    if (timingSafeHexEqual(sign(secret, { timestamp: ts, method, path, body, nonce }), sig)) match = true;
  }
  return match ? { ok: true, app, nonce } : { ok: false, reason: 'bad_signature' };
}

module.exports = { WINDOW_S, MIN_SECRET_BYTES, sha256Hex, canonical, sign, headers, parseKeys, verify };
