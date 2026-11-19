// Ratgeber verwalten (Inhalte → Ratgeber): Stand-Daten, Status, Title/Meta/H1, Karten (z. B. Bäder je Reiseziel),
// Partner-Link-Slots und Hinweiskasten in Liste/Regionsseiten. Jede Änderung schreibt admin_actions.
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/context');
const { logAction } = require('../lib/audit');
const guides = require('../services/guides');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.use(requireAdmin);
router.param('id', (req, res, next, v) => (UUID_RE.test(v) ? next() : next('route')));

const str = (v, max = 2000) => String(v === undefined || v === null ? '' : v).trim().slice(0, max);
const date = (v) => (DATE_RE.test(str(v)) ? str(v) : null);
const back = (res, key, msg, anchor = '') => res.redirect(`/admin/ratgeber?${key}=${encodeURIComponent(msg)}${anchor}`);
// Datum (pg date → Date um Mitternacht lokal) für <input type="date">
const formatIso = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const touch = (guideId) => db.query('UPDATE guides SET content_changed_at = now(), updated_at = now() WHERE id = $1', [guideId]);

async function render(req, res) {
  const list = await db.many(`SELECT g.*, s.name AS site_name, s.id AS site_id FROM guides g JOIN sites s ON s.id = g.site_id ORDER BY s.name, g.slug`);
  for (const g of list) {
    g.cards = await guides.cards(g.id, { publicOnly: false });
    for (const c of g.cards) { c.public = guides.cardPublic(c); c.unverified = guides.unverified(c.title) || guides.unverified(c.body); }
  }
  const slotRows = await db.many(
    `SELECT s.*, st.name AS site_name, p.code AS p_code, p.name AS p_name, p.status AS p_status, p.link_template AS p_link_template, p.domains AS p_domains,
            p.trademark_notice AS p_trademark_notice,
            (SELECT COALESCE(sum(c.clicks), 0)::int FROM outbound_clicks c WHERE c.kind = $1 AND c.target_id = s.id AND c.day > current_date - 30) AS clicks30
       FROM partner_slots s JOIN sites st ON st.id = s.site_id LEFT JOIN partner_programs p ON p.id = s.program_id
      ORDER BY st.name, s.sort_order, s.key`, [guides.CLICK_KIND]);
  for (const s of slotRows) {
    const program = s.p_code ? { code: s.p_code, name: s.p_name, status: s.p_status, link_template: s.p_link_template, domains: s.p_domains } : null;
    // Vorschau ohne Rücksicht auf den Programmstatus: welcher Link stünde im href?
    s.preview = guides.slotHref({ ...s, active: true }, program && { ...program, status: 'active' }, 'ratgeber');
    s.live = Boolean(guides.slotHref(s, program, 'ratgeber'));
  }
  const programs = await db.many(`SELECT id, code, name, status FROM partner_programs ORDER BY sort_order, lower(name)`);
  const regions = await db.many(`SELECT site_id, slug, name FROM regions WHERE status = 'active' ORDER BY name`);
  res.render('admin/guides', {
    title: 'Ratgeber', formatIso, list, slotRows, programs, regions, flash: req.query.ok || null, error: req.query.fehler || null,
  });
}

router.get('/', wrap(render));

// Ratgeber: Status, Meta-Angaben, Stand-Daten, Kernfakten der Liste
router.post('/:id', wrap(async (req, res, next) => {
  const old = await db.one('SELECT * FROM guides WHERE id = $1', [req.params.id]);
  if (!old) return next();
  const b = req.body;
  const f = {
    status: b.status === 'active' ? 'active' : 'draft',
    title: str(b.title, 200), description: str(b.description, 400), h1: str(b.h1, 300),
    updated_on: date(b.updated_on), research_on: date(b.research_on), published_on: date(b.published_on),
    list_criteria: str(b.list_criteria, 300).split(/[\s,]+/).filter((c) => /^[a-z0-9_]+$/.test(c)).slice(0, 6),
  };
  const errors = guides.validateMeta(f);
  if (!f.updated_on) errors.push('„Aktualisiert“ als Datum angeben.');
  if (errors.length) return back(res, 'fehler', errors.join(' '), `#g-${old.id}`);
  await db.query(
    `UPDATE guides SET status=$2, title=$3, description=$4, h1=$5, updated_on=$6, research_on=$7, published_on=$8, list_criteria=$9,
            content_changed_at = CASE WHEN title IS DISTINCT FROM $3 OR description IS DISTINCT FROM $4 OR h1 IS DISTINCT FROM $5
                                        OR updated_on IS DISTINCT FROM $6::date OR research_on IS DISTINCT FROM $7::date THEN now() ELSE content_changed_at END,
            updated_at = now() WHERE id = $1`,
    [old.id, f.status, f.title, f.description, f.h1, f.updated_on, f.research_on, f.published_on, f.list_criteria]);
  await logAction(req.session.admin.id, 'guide', old.id, 'guide.edit', {
    status: { old: old.status, new: f.status }, title: f.title !== old.title ? f.title : undefined,
    updated_on: f.updated_on, research_on: f.research_on, list_criteria: f.list_criteria,
  });
  back(res, 'ok', 'Ratgeber gespeichert', `#g-${old.id}`);
}));

// Hinweiskasten (Liste und Regionsseiten): an/aus, Position, Text, Link je Region
router.post('/:id/kasten', wrap(async (req, res, next) => {
  const old = await db.one('SELECT * FROM guides WHERE id = $1', [req.params.id]);
  if (!old) return next();
  const b = req.body;
  const regionsMap = {};
  for (const [slug, key] of Object.entries(b.regions || {})) if (/^[a-z0-9-]+$/.test(slug) && /^[a-z0-9-]+$/.test(String(key))) regionsMap[slug] = String(key);
  const box = {
    active: b.active === 'on', after: Math.max(0, Math.min(50, Number(b.after) || 0)) || null,
    heading: str(b.heading, 120), text: str(b.text, 400), guide_label: str(b.guide_label, 120) || null,
    default_slot: /^[a-z0-9-]+$/.test(str(b.default_slot)) ? str(b.default_slot) : null, regions: regionsMap,
  };
  const errors = [];
  if (box.active && (!box.heading || !box.text || !box.default_slot)) errors.push('Aktiver Kasten braucht Überschrift, Text und einen Standard-Link.');
  if (guides.unverified(box.heading) || guides.unverified(box.text)) errors.push('Platzhalter oder [PRÜFEN] entfernen.');
  if (errors.length) return back(res, 'fehler', errors.join(' '), `#kasten-${old.id}`);
  await db.query(`UPDATE guides SET settings = settings || jsonb_build_object('box', $2::jsonb), updated_at = now() WHERE id = $1`, [old.id, JSON.stringify(box)]);
  await logAction(req.session.admin.id, 'guide', old.id, 'guide.box', box);
  back(res, 'ok', 'Hinweiskasten gespeichert', `#kasten-${old.id}`);
}));

// Karten: anlegen, ändern, löschen. Aktivieren nur ohne [PRÜFEN] und Platzhalter.
function readCard(b) {
  return {
    title: str(b.title, 200), body: str(b.body, 6000), section: /^[a-z0-9-]+$/.test(str(b.section)) ? str(b.section) : 'baeder',
    sort_order: Number.isFinite(Number(b.sort_order)) ? Math.round(Number(b.sort_order)) : 100,
    checked_on: date(b.checked_on), link_slot: /^[a-z0-9-]+$/.test(str(b.link_slot)) ? str(b.link_slot) : null,
    region_slug: /^[a-z0-9-]+$/.test(str(b.region_slug)) ? str(b.region_slug) : null,
    entity_slugs: str(b.entity_slugs, 500).split(/[\s,]+/).filter((s) => /^[a-z0-9-]+$/.test(s)).slice(0, 5),
    status: b.status === 'active' ? 'active' : 'hidden',
  };
}

router.post('/:id/karten', wrap(async (req, res, next) => {
  const g = await db.one('SELECT id FROM guides WHERE id = $1', [req.params.id]);
  if (!g) return next();
  const c = readCard(req.body);
  const errors = guides.validateCard(c);
  if (errors.length) return back(res, 'fehler', errors.join(' '), `#karten-${g.id}`);
  const row = await db.one(
    `INSERT INTO guide_cards (guide_id, section, sort_order, title, body, checked_on, link_slot, region_slug, entity_slugs, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [g.id, c.section, c.sort_order, c.title, c.body, c.checked_on, c.link_slot, c.region_slug, c.entity_slugs, c.status]);
  if (c.status === 'active') await touch(g.id);
  await logAction(req.session.admin.id, 'guide_card', row.id, 'guide_card.create', { title: c.title, status: c.status });
  back(res, 'ok', 'Karte angelegt', `#karte-${row.id}`);
}));

router.post('/karten/:id', wrap(async (req, res, next) => {
  const old = await db.one('SELECT * FROM guide_cards WHERE id = $1', [req.params.id]);
  if (!old) return next();
  if (req.body.action === 'delete') {
    await db.query('DELETE FROM guide_cards WHERE id = $1', [old.id]);
    if (old.status === 'active') await touch(old.guide_id);
    await logAction(req.session.admin.id, 'guide_card', old.id, 'guide_card.delete', { title: old.title, body: old.body });
    return back(res, 'ok', 'Karte gelöscht', `#karten-${old.guide_id}`);
  }
  const c = readCard(req.body);
  const errors = guides.validateCard(c);
  if (errors.length) return back(res, 'fehler', `${old.title}: ${errors.join(' ')}`, `#karte-${old.id}`);
  await db.query(
    `UPDATE guide_cards SET section=$2, sort_order=$3, title=$4, body=$5, checked_on=$6, link_slot=$7, region_slug=$8, entity_slugs=$9, status=$10, updated_at=now() WHERE id=$1`,
    [old.id, c.section, c.sort_order, c.title, c.body, c.checked_on, c.link_slot, c.region_slug, c.entity_slugs, c.status]);
  if (old.status === 'active' || c.status === 'active') await touch(old.guide_id);
  await logAction(req.session.admin.id, 'guide_card', old.id, 'guide_card.edit', {
    title: c.title, status: { old: old.status, new: c.status }, body_changed: old.body !== c.body, checked_on: c.checked_on,
  });
  back(res, 'ok', `Karte „${c.title}“ gespeichert`, `#karte-${old.id}`);
}));

// Link-Slots: Programm, Zieladresse oder fester Netzwerk-Link, Ankertext, aktiv
function readSlot(b) {
  return {
    key: str(b.key, 60).toLowerCase(), label: str(b.label, 200), program_id: UUID_RE.test(str(b.program_id)) ? str(b.program_id) : null,
    target_url: str(b.target_url, 2000) || null, fixed_href: str(b.fixed_href, 2000) || null, anchor: str(b.anchor, 160),
    active: b.active === 'on', sort_order: Number.isFinite(Number(b.sort_order)) ? Math.round(Number(b.sort_order)) : 100,
  };
}

async function saveSlot(req, res, old) {
  const s = readSlot(req.body);
  const program = s.program_id ? await db.one('SELECT * FROM partner_programs WHERE id = $1', [s.program_id]) : null;
  const errors = guides.validateSlot(s, program);
  if (!old && !/^[a-z0-9-]{2,40}$/.test(s.key)) errors.push('Schlüssel: 2–40 Zeichen a–z, 0–9, Bindestrich.');
  const siteId = old ? old.site_id : (UUID_RE.test(str(req.body.site_id)) ? str(req.body.site_id) : null);
  if (!siteId) errors.push('Site fehlt.');
  if (errors.length) return back(res, 'fehler', `${old ? old.key : s.key || 'Neuer Slot'}: ${errors.join(' ')}`, '#slots');
  if (old) {
    await db.query(`UPDATE partner_slots SET label=$2, program_id=$3, target_url=$4, fixed_href=$5, anchor=$6, active=$7, sort_order=$8, updated_at=now() WHERE id=$1`,
      [old.id, s.label || old.label, s.program_id, s.target_url, s.fixed_href, s.anchor, s.active, s.sort_order]);
    await logAction(req.session.admin.id, 'partner_slot', old.id, 'partner_slot.edit', {
      key: old.key, active: { old: old.active, new: s.active }, target_url: s.target_url, fixed_href: s.fixed_href, anchor: s.anchor,
    });
    return back(res, 'ok', `Link-Slot „${old.key}“ gespeichert`, '#slots');
  }
  try {
    const row = await db.one(
      `INSERT INTO partner_slots (site_id, key, label, program_id, target_url, fixed_href, anchor, active, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [siteId, s.key, s.label || s.key, s.program_id, s.target_url, s.fixed_href, s.anchor, s.active, s.sort_order]);
    await logAction(req.session.admin.id, 'partner_slot', row.id, 'partner_slot.create', { key: s.key, active: s.active });
  } catch (err) {
    if (err.code !== '23505') throw err;
    return back(res, 'fehler', `Schlüssel „${s.key}“ gibt es schon.`, '#slots');
  }
  back(res, 'ok', `Link-Slot „${s.key}“ angelegt`, '#slots');
}

router.post('/slots', wrap(async (req, res) => saveSlot(req, res, null)));
router.post('/slots/:id', wrap(async (req, res, next) => {
  const old = await db.one('SELECT * FROM partner_slots WHERE id = $1', [req.params.id]);
  if (!old) return next();
  await saveSlot(req, res, old);
}));

module.exports = router;
