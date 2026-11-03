// Interne API v1 für den Hub danielreuland.com (Vertrag: docs/internal-api.md). In server.js VOR Sitzung, CSRF und
// Body-Parsern eingehängt: keine Cookies, keine Sitzung. Drei Schutzschichten: Nginx (/internal/ → 404), hier nur
// Loopback ohne Proxy-Header, HMAC-Signatur je App. Nur lesend.
const express = require('express');
const config = require('../config');
const db = require('../db');
const auth = require('../lib/internal-auth');

const RATE_LIMIT = 120;      // Aufrufe je Minute und App
const RATE_WINDOW_MS = 60 * 1000;
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const PROXY_HEADERS = ['x-forwarded-for', 'x-real-ip', 'forwarded'];

class BadRequest extends Error {}

// Pfad fürs Protokoll: Query-Werte entfernen (Suchbegriffe könnten Namen enthalten), nur die Parameternamen behalten
function logPath(originalUrl) {
  const [pathname, query] = String(originalUrl).split('?');
  if (query === undefined) return pathname.slice(0, 300);
  const names = [...new URLSearchParams(query).keys()];
  return `${pathname}?${names.map((n) => `${n}=`).join('&')}`.slice(0, 300);
}

async function logCall(entry) {
  try {
    await db.query(
      `INSERT INTO internal_api_calls (app, method, path, status, duration_ms, reason) VALUES ($1, $2, $3, $4, $5, $6)`,
      [entry.app, entry.method, entry.path, entry.status, entry.durationMs, entry.reason]);
  } catch (err) {
    console.error('[internal-api] Protokoll', err.message);
  }
}

// --- Parameter ----------------------------------------------------------------------------------------------------

function intParam(raw, { def, min, max, name }) {
  if (raw === undefined || raw === '') return def;
  if (!/^\d+$/.test(String(raw)) || Number(raw) < min || Number(raw) > max) throw new BadRequest(`${name} muss eine ganze Zahl von ${min} bis ${max} sein.`);
  return Number(raw);
}

function idsParam(raw, uuidRe) {
  const ids = [...new Set(String(raw).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))];
  if (!ids.length || ids.length > 100) throw new BadRequest('ids braucht 1 bis 100 IDs.');
  if (!ids.every((id) => uuidRe.test(id))) throw new BadRequest('ids enthält eine ungültige ID.');
  return ids;
}

function queryParam(raw) {
  const q = String(raw || '').trim();
  if (q.length < 2 || q.length > 100) throw new BadRequest('Suchbegriff q braucht 2 bis 100 Zeichen.');
  return q;
}

const ENTITY_STATUS = ['draft', 'in_review', 'live', 'rejected'];
const CAMP_STATUS = ['draft', 'active', 'archived'];

// Suche (q), Stapelabruf (ids) oder Sammelabruf nach Status (status, seitenweise) – genau eins davon
async function listOrSearch(req, { search, byIds, byStatus, statuses, uuidRe }) {
  const { q, ids, status } = req.query;
  const modes = [q, ids, status].filter((x) => typeof x !== 'undefined');
  if (modes.length !== 1) throw new BadRequest('Genau einen von q, ids oder status angeben.');
  if (modes.some(Array.isArray)) throw new BadRequest('Parameter nur einmal angeben.');
  if (typeof ids !== 'undefined') return { items: await byIds(idsParam(ids, uuidRe)) };
  if (typeof status !== 'undefined') {
    if (!statuses.includes(status)) throw new BadRequest(`status muss einer von ${statuses.join(', ')} sein.`);
    const ranking = req.query.ranking === undefined ? null : String(req.query.ranking);
    if (ranking !== null && !/^[a-z0-9-]{1,64}$/.test(ranking)) throw new BadRequest('ranking ist kein gültiger Code.');
    return byStatus({
      status, ranking,
      limit: intParam(req.query.limit, { def: 50, min: 1, max: 100, name: 'limit' }),
      offset: intParam(req.query.offset, { def: 0, min: 0, max: 100000, name: 'offset' }),
    });
  }
  const limit = intParam(req.query.limit, { def: 20, min: 1, max: 50, name: 'limit' });
  return { items: await search(queryParam(q), limit) };
}

// --- Router -------------------------------------------------------------------------------------------------------

function createRouter({
  service = require('../services/internal-api'),
  keys = auth.parseKeys(config.internalApiKeys),
  log = logCall,
  now = () => Date.now(),
  remoteAddress = (req) => req.socket.remoteAddress,
  rateLimit = RATE_LIMIT,
} = {}) {
  const router = express.Router();
  const windows = new Map(); // app -> { start, count }

  router.use((req, res, next) => {
    const started = now();
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
    res.on('finish', () => {
      log({ app: req.internalApp || String(req.get('x-internal-app') || '').slice(0, 32) || null, method: req.method,
        path: logPath(req.originalUrl), status: res.statusCode, durationMs: Math.max(now() - started, 0), reason: res.locals.denyReason || null });
    });
    // Nur direkt vom Server selbst; über Nginx (Proxy-Header) oder von außen: so tun, als gäbe es nichts
    if (!LOOPBACK.has(remoteAddress(req)) || PROXY_HEADERS.some((h) => req.headers[h] !== undefined)) {
      res.locals.denyReason = 'not_loopback';
      return res.status(404).json({ error: 'not_found', message: 'Nicht gefunden.' });
    }
    if (req.method !== 'GET') {
      res.set('Allow', 'GET');
      return res.status(405).json({ error: 'method_not_allowed', message: 'Nur GET.' });
    }
    // GET ohne Body: Signatur über den leeren Body
    const v = auth.verify({ keys, headers: req.headers, method: req.method, path: req.originalUrl, body: '', now: now() });
    if (!v.ok) {
      res.locals.denyReason = v.reason;
      return res.status(401).json({ error: 'unauthorized', message: 'Signatur ungültig oder abgelaufen.' });
    }
    req.internalApp = v.app;
    const t = now();
    let w = windows.get(v.app);
    if (!w || t - w.start >= RATE_WINDOW_MS) windows.set(v.app, (w = { start: t, count: 0 }));
    w.count += 1;
    if (w.count > rateLimit) {
      res.locals.denyReason = 'rate_limited';
      res.set('Retry-After', String(Math.max(Math.ceil((w.start + RATE_WINDOW_MS - t) / 1000), 1)));
      return res.status(429).json({ error: 'rate_limited', message: `Mehr als ${rateLimit} Aufrufe je Minute.` });
    }
    return next();
  });

  const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
  const notFound = (res) => res.status(404).json({ error: 'not_found', message: 'Nicht gefunden.' });
  const idOk = (id) => service.UUID_RE.test(id);
  const days = (req) => intParam(req.query.days, { def: 30, min: 1, max: 365, name: 'days' });

  router.get('/v1/entities', wrap(async (req, res) => {
    res.json(await listOrSearch(req, {
      search: service.searchEntities, byIds: service.entitiesByIds, byStatus: service.listEntities, statuses: ENTITY_STATUS, uuidRe: service.UUID_RE,
    }));
  }));
  router.get('/v1/entities/:id', wrap(async (req, res) => {
    const e = idOk(req.params.id) ? await service.entity(req.params.id.toLowerCase()) : null;
    return e ? res.json(e) : notFound(res);
  }));
  router.get('/v1/entities/:id/metrics', wrap(async (req, res) => {
    const d = days(req);
    const m = idOk(req.params.id) ? await service.entityMetrics(req.params.id.toLowerCase(), d) : null;
    return m ? res.json(m) : notFound(res);
  }));
  router.get('/v1/camp-providers', wrap(async (req, res) => {
    if (req.query.ranking !== undefined) throw new BadRequest('ranking gilt nur für entities.');
    res.json(await listOrSearch(req, {
      search: service.searchCampProviders, byIds: service.campProvidersByIds, byStatus: service.listCampProviders, statuses: CAMP_STATUS, uuidRe: service.UUID_RE,
    }));
  }));
  router.get('/v1/camp-providers/:id', wrap(async (req, res) => {
    const p = idOk(req.params.id) ? await service.campProvider(req.params.id.toLowerCase()) : null;
    return p ? res.json(p) : notFound(res);
  }));
  router.get('/v1/camp-providers/:id/metrics', wrap(async (req, res) => {
    const d = days(req);
    const m = idOk(req.params.id) ? await service.campProviderMetrics(req.params.id.toLowerCase(), d) : null;
    return m ? res.json(m) : notFound(res);
  }));
  router.get('/v1/partner-programs', wrap(async (req, res) => res.json(await service.partnerPrograms())));
  router.get('/v1/stats', wrap(async (req, res) => res.json(await service.stats())));

  router.use((req, res) => notFound(res));
  // eslint-disable-next-line no-unused-vars
  router.use((err, req, res, next) => {
    if (err instanceof BadRequest) return res.status(400).json({ error: 'bad_request', message: err.message });
    console.error('[internal-api]', err);
    return res.status(500).json({ error: 'internal', message: 'Fehler in tri-hotel.' });
  });
  return router;
}

module.exports = { createRouter, logPath, RATE_LIMIT };
