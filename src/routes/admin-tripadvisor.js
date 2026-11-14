// Tripadvisor-Fotos im Admin (B-87): Übersicht mit Budget, Location IDs suchen und bestätigen, Auswahl der Objekte,
// Abgleich der Allowlist. Jeder Aufruf an Tripadvisor läuft über den Budget-Wächter; jede Änderung steht im Audit-Log.
const express = require('express');
const db = require('../db');
const ta = require('../services/tripadvisor');
const { requireAdmin } = require('../middleware/context');
const { logAction } = require('../lib/audit');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODES = { name_city: 'Name und Ort', name: 'Name und Land', nearby: 'Umkreis 1 km' };
const BATCH_SIZE = 15;       // je Klick, damit die Anfrage nicht in die Zeitgrenze des Webservers läuft
const SEARCH_PAUSE_MS = 1100; // Such-Endpunkte: höchstens 1 Aufruf je Sekunde

router.use(requireAdmin);
router.param('entityId', (req, res, next, v) => (UUID_RE.test(v) ? next() : next('route')));

const list = (v) => [].concat(v || []).map(String);
const back = (kind, msg, entityId) => `/admin/tripadvisor?${kind}=${encodeURIComponent(msg)}${entityId ? `#e-${entityId}` : ''}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adminId = (req) => req.session.admin.id;

// Objekte ab dem Mindest-Score, für die noch keine Location ID gesucht wurde
const OPEN_SQL = `e.ta_location_id IS NULL AND e.ta_suggestion IS NULL
  AND EXISTS (SELECT 1 FROM entity_rankings er WHERE er.entity_id = e.id AND er.status = 'live' AND er.score >= $1)`;

router.get('/', wrap(async (req, res) => {
  const o = await ta.overview();
  const { n: open } = await db.one(`SELECT count(*)::int AS n FROM entities e WHERE ${OPEN_SQL}`, [ta.cfg.minScore]);
  const plan = ta.allowlistPlan(o.rows);
  res.render('admin/tripadvisor', {
    title: 'Tripadvisor-Fotos', ...o, open, batchSize: BATCH_SIZE,
    pending: ta.cfg.allowlist ? plan.append.length + plan.remove.length : 0,
    enabledCount: o.rows.filter((r) => r.ta_photos_enabled).length,
    // nur unkritische Werte in die Ansicht – nie den Schlüssel
    cfg: {
      enabled: ta.cfg.enabled, hasKey: Boolean(ta.cfg.apiKey), allowlist: ta.cfg.allowlist, maxHotels: ta.cfg.maxHotels, minScore: ta.cfg.minScore,
      searchSize: ta.cfg.searchSize, photoCount: ta.cfg.photoCount, unitPriceUsd: ta.cfg.unitPriceUsd, viewLockMinutes: ta.cfg.viewLockMinutes,
    },
    STATUS_LABELS: ta.STATUS_LABELS, MODES, links: ta.links,
    flash: req.query.ok || null, error: req.query.fehler || null,
  });
}));

// Auswahl speichern: Häkchen je Objekt; danach die Allowlist abgleichen
router.post('/auswahl', wrap(async (req, res) => {
  const shown = list(req.body.shown).filter((id) => UUID_RE.test(id));
  const checked = new Set(list(req.body.enabled));
  if (!shown.length) return res.redirect(back('fehler', 'Keine Objekte übermittelt.'));
  const rows = await db.many(`SELECT id, name, ta_location_id, ta_photos_enabled FROM entities WHERE id = ANY($1::uuid[])`, [shown]);
  const on = rows.filter((r) => checked.has(r.id) && !r.ta_photos_enabled);
  const off = rows.filter((r) => !checked.has(r.id) && r.ta_photos_enabled);
  const noId = on.filter((r) => !r.ta_location_id);
  if (noId.length) return res.redirect(back('fehler', `Ohne Location ID nicht möglich: ${noId.map((r) => r.name).join(', ')}`));
  const { n: current } = await db.one(`SELECT count(*)::int AS n FROM entities WHERE ta_photos_enabled`);
  const after = current + on.length - off.length;
  if (on.length && after > ta.cfg.maxHotels) {
    return res.redirect(back('fehler', `Höchstens ${ta.cfg.maxHotels} Objekte mit Tripadvisor-Fotos (gewählt: ${after}). Grenze: TA_MAX_HOTELS.`));
  }
  for (const r of on) {
    await db.query(`UPDATE entities SET ta_photos_enabled = true, updated_at = now() WHERE id = $1`, [r.id]);
    await logAction(adminId(req), 'entity', r.id, 'ta_photos_enable', { location_id: r.ta_location_id });
  }
  for (const r of off) {
    await db.query(`UPDATE entities SET ta_photos_enabled = false, updated_at = now() WHERE id = $1`, [r.id]);
    await logAction(adminId(req), 'entity', r.id, 'ta_photos_disable', { location_id: r.ta_location_id });
  }
  if (!on.length && !off.length) return res.redirect(back('ok', 'Keine Änderung.'));
  const sync = await ta.syncAllowlist();
  if (!sync.skipped) await logAction(adminId(req), 'admin_user', adminId(req), 'ta_allowlist_sync', sync);
  const msg = `${on.length} ausgewählt, ${off.length} abgewählt.`;
  if (sync.errors.length) return res.redirect(back('fehler', `${msg} Allowlist noch nicht abgeglichen – ${sync.errors.join(' ')}`));
  res.redirect(back('ok', sync.skipped ? msg : `${msg} Allowlist: ${sync.added} hinzugefügt, ${sync.removed} entfernt.`));
}));

// Einzelsuche: Treffer werden nur in dieser Antwort gezeigt; vorgemerkt werden allein die IDs
router.post('/:entityId/suchen', wrap(async (req, res, next) => {
  const mode = MODES[req.body.art] ? req.body.art : 'name_city';
  const e = await db.one(`SELECT * FROM entities WHERE id = $1`, [req.params.entityId]);
  if (!e) return next();
  const r = await ta.search(e, mode);
  if (!r.ok) return res.redirect(back('fehler', `${e.name}: ${ta.reasonText(r.reason, r.status)}`, e.id));
  if (!e.ta_location_id) await ta.saveSuggestion(e.id, r);
  await logAction(adminId(req), 'entity', e.id, 'ta_search', { mode, units: r.units, hits: r.candidates.length });
  res.set('Cache-Control', 'no-store');
  res.render('admin/tripadvisor-search', {
    title: `Tripadvisor: ${e.name}`, entity: e, mode, MODES, result: r, links: ta.links, MAX_DISTANCE_M: ta.MAX_DISTANCE_M,
    usage: await ta.usage(), searchSize: ta.cfg.searchSize,
  });
}));

// Sammelsuche für Objekte ab dem Mindest-Score ohne ID und ohne bisherige Suche. Bricht beim ersten Hindernis ab
// (Not-Aus, Grenze, Fehler) – nichts wird wiederholt. Ohne Treffer mit Ort folgt eine Suche nur mit Name und Land;
// eine leere Antwort kostet keine Einheit.
router.post('/sammelsuche', wrap(async (req, res) => {
  const todo = await db.many(`SELECT e.* FROM entities e WHERE ${OPEN_SQL} ORDER BY lower(e.name) LIMIT ${BATCH_SIZE}`, [ta.cfg.minScore]);
  const count = { searched: 0, found: 0, unclear: 0, none: 0, units: 0 };
  let stop = null;
  for (const e of todo) {
    if (count.searched) await sleep(SEARCH_PAUSE_MS);
    let r = await ta.search(e, 'name_city');
    if (r.ok && !r.candidates.length && e.city) {
      await sleep(SEARCH_PAUSE_MS);
      r = await ta.search(e, 'name');
    }
    if (!r.ok) { stop = ta.reasonText(r.reason, r.status); break; }
    const s = await ta.saveSuggestion(e.id, r);
    count.searched += 1;
    count[s.status] += 1;
    count.units += r.units;
  }
  await logAction(adminId(req), 'admin_user', adminId(req), 'ta_bulk_search', { ...count, stopped: stop });
  const msg = `${count.searched} von ${todo.length} gesucht (${count.units} Einheiten): ${count.found} eindeutig, ${count.unclear} unklar, ${count.none} ohne Treffer.`;
  res.redirect(stop ? back('fehler', `${msg} Abgebrochen – ${stop}`) : back('ok', msg));
}));

// Location ID übernehmen (aus Suche oder Vormerkung) oder von Hand eintragen
router.post('/:entityId/id', wrap(async (req, res) => {
  const raw = String(req.body.location_id || '').trim();
  if (!/^\d{1,10}$/.test(raw)) return res.redirect(back('fehler', 'Die Location ID ist eine positive ganze Zahl.', req.params.entityId));
  const r = await ta.setLocationId(req.params.entityId, Number(raw));
  if (!r.ok) return res.redirect(back('fehler', r.error, req.params.entityId));
  await logAction(adminId(req), 'entity', req.params.entityId, 'ta_location_id', { old: r.old, new: r.new, via: ['search', 'suggestion'].includes(req.body.via) ? req.body.via : 'manual' });
  res.redirect(back('ok', `Location ID ${r.new} gespeichert.`, req.params.entityId));
}));

router.post('/:entityId/id-entfernen', wrap(async (req, res) => {
  const r = await ta.setLocationId(req.params.entityId, null);
  if (!r.ok) return res.redirect(back('fehler', r.error, req.params.entityId));
  await logAction(adminId(req), 'entity', req.params.entityId, 'ta_location_id', { old: r.old, new: null, via: 'manual' });
  res.redirect(back('ok', 'Location ID entfernt.', req.params.entityId));
}));

router.post('/:entityId/verwerfen', wrap(async (req, res) => {
  await ta.dismissSuggestion(req.params.entityId);
  await logAction(adminId(req), 'entity', req.params.entityId, 'ta_suggestion_dismiss', null);
  res.redirect(back('ok', 'Vormerkung verworfen.', req.params.entityId));
}));

// Ausstehende Änderungen an die Allowlist übertragen (nur APPEND und DELETE)
router.post('/allowlist/abgleichen', wrap(async (req, res) => {
  const sync = await ta.syncAllowlist();
  if (sync.skipped) return res.redirect(back('ok', 'Allowlist ist ausgeschaltet (TA_ALLOWLIST=false).'));
  await logAction(adminId(req), 'admin_user', adminId(req), 'ta_allowlist_sync', sync);
  if (sync.errors.length) return res.redirect(back('fehler', `Allowlist: ${sync.errors.join(' ')}`));
  res.redirect(back('ok', `Allowlist: ${sync.added} hinzugefügt, ${sync.removed} entfernt.`));
}));

// Allowlist bei Tripadvisor lesen und mit unserem Stand vergleichen (kostet nichts, ändert nichts)
router.post('/allowlist/pruefen', wrap(async (req, res) => {
  const remote = await ta.allowlistRemote();
  if (!remote.ok) {
    const hint = remote.status === 403 ? ' Der Schlüssel hat keinen Zugriff auf die Allowlist-API (nicht im Paket?).' : '';
    return res.redirect(back('fehler', `Allowlist lesen: ${ta.reasonText(remote.reason, remote.status)}${hint}`));
  }
  const ours = (await db.many(`SELECT ta_location_id FROM entities WHERE ta_allowlisted_at IS NOT NULL AND ta_location_id IS NOT NULL`)).map((r) => r.ta_location_id);
  const there = new Set(remote.ids);
  const here = new Set(ours);
  const missing = ours.filter((id) => !there.has(id));
  const extra = remote.ids.filter((id) => !here.has(id));
  await logAction(adminId(req), 'admin_user', adminId(req), 'ta_allowlist_check', { remote: remote.ids.length, missing, extra });
  const msg = `Allowlist bei Tripadvisor: ${remote.ids.length} IDs.`
    + (missing.length ? ` Fehlen dort: ${missing.join(', ')}.` : '')
    + (extra.length ? ` Dort zusätzlich (nicht von uns freigegeben): ${extra.join(', ')}.` : '')
    + (!missing.length && !extra.length ? ' Stimmt mit unserem Stand überein.' : '');
  res.redirect(back(missing.length || extra.length ? 'fehler' : 'ok', msg));
}));

module.exports = router;
