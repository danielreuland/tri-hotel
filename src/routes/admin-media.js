// Medienbibliothek: Stimmungsbilder (Stockfotos, eigene Fotos) für allgemeine Bereiche einer Site.
// Pflicht: Anbieter, Lizenz, Urhebervermerk, Bildbeschreibung und Bestätigung „generisches Motiv“.
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const config = require('../config');
const media = require('../services/media');
const { requireAdmin } = require('../middleware/context');
const { logAction } = require('../lib/audit');
const { normalizeUrl } = require('../lib/util');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.use(requireAdmin);
router.param('id', (req, res, next, v) => (UUID_RE.test(v) ? next() : next('route')));

const upload = multer({
  dest: path.join(config.uploadDir, 'tmp'),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
});

async function render(req, res, extra = {}) {
  const sites = await db.many(`SELECT id, name FROM sites ORDER BY is_default DESC, name`);
  const siteId = UUID_RE.test(req.query.site || '') ? req.query.site : sites[0] && sites[0].id;
  const rows = await db.many(
    `SELECT m.*, r.name AS region_name FROM site_media m LEFT JOIN regions r ON r.id = m.region_id
      WHERE m.site_id = $1 ORDER BY (m.slot IS NULL AND m.region_id IS NULL), m.slot, r.sort_order, m.created_at DESC`,
    [siteId]
  );
  const regions = await db.many(`SELECT id, name FROM regions WHERE site_id = $1 ORDER BY sort_order, name`, [siteId]);
  res.render('admin/media', {
    title: 'Medien', sites, siteId, rows, regions, SLOTS: media.SLOTS, imgAttrs: media.imgAttrs,
    errors: [], flash: req.query.ok || null, form: {}, ...extra,
  });
}

router.get('/', wrap(render));

// Platz/Region auflösen: "slot:home_hero" oder "region:<uuid>" oder "" (nur Bibliothek)
function placement(v) {
  const s = String(v || '');
  if (s.startsWith('slot:') && media.SLOTS[s.slice(5)]) return { slot: s.slice(5), region_id: null };
  if (s.startsWith('region:') && UUID_RE.test(s.slice(7))) return { slot: null, region_id: s.slice(7) };
  return { slot: null, region_id: null };
}

// Platz frei machen: ein Bild je Platz/Region
async function freePlacement(client, siteId, p, exceptId = null) {
  if (p.slot) await client.query(`UPDATE site_media SET slot = NULL WHERE site_id = $1 AND slot = $2 AND id IS DISTINCT FROM $3`, [siteId, p.slot, exceptId]);
  if (p.region_id) await client.query(`UPDATE site_media SET region_id = NULL WHERE site_id = $1 AND region_id = $2 AND id IS DISTINCT FROM $3`, [siteId, p.region_id, exceptId]);
}

const FOCAL = { center: '50% 50%', top: '50% 25%', bottom: '50% 75%', left: '25% 50%', right: '75% 50%' };

router.post('/', upload.single('file'), wrap(async (req, res) => {
  const b = req.body;
  const tmp = req.file && req.file.path;
  const form = { ...b };
  const errors = [];
  const siteId = UUID_RE.test(b.site_id || '') ? b.site_id : null;
  if (!req.file) errors.push('Bild (JPG, PNG oder WebP, max. 20 MB) wählen.');
  if (!siteId) errors.push('Site wählen.');
  for (const [k, label] of [['alt', 'Bildbeschreibung'], ['provider', 'Anbieter'], ['license', 'Lizenz'], ['credit', 'Urhebervermerk']]) {
    if (!String(b[k] || '').trim()) errors.push(`${label} ist Pflicht.`);
  }
  if (b.generic !== 'on') errors.push('Bitte bestätigen: generisches Motiv, kommerzielle Nutzung erlaubt, kein bestimmtes Hotel erkennbar.');
  if (errors.length) {
    if (tmp) fs.unlink(tmp, () => {});
    req.query.site = siteId;
    return render(req, res, { errors, form });
  }
  const id = crypto.randomUUID();
  let info;
  try {
    info = await media.processUpload(id, tmp);
  } catch (err) {
    req.query.site = siteId;
    return render(req, res, { errors: [`Bild konnte nicht verarbeitet werden: ${err.message}`], form });
  } finally {
    fs.unlink(tmp, () => {});
  }
  const p = placement(b.placement);
  await db.tx(async (client) => {
    await freePlacement(client, siteId, p);
    await client.query(
      `INSERT INTO site_media (id, site_id, slot, region_id, alt, provider, license, credit, source_url, focal, width, height, variants, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [id, siteId, p.slot, p.region_id, b.alt.trim().slice(0, 300), b.provider.trim().slice(0, 80), b.license.trim().slice(0, 120),
        b.credit.trim().slice(0, 160), normalizeUrl(b.source_url), FOCAL[b.focal] || FOCAL.center,
        info.width, info.height, info.variants, req.session.admin.id]
    );
    await logAction(req.session.admin.id, 'media', id, 'upload_media', { provider: b.provider, license: b.license, credit: b.credit, ...p }, client);
  });
  media.invalidate();
  res.redirect(`/admin/medien?site=${siteId}&ok=Bild+gespeichert`);
}));

// Platz, Bildausschnitt oder Beschreibung ändern
router.post('/:id', wrap(async (req, res, next) => {
  const m = await db.one('SELECT * FROM site_media WHERE id = $1', [req.params.id]);
  if (!m) return next();
  const p = placement(req.body.placement);
  await db.tx(async (client) => {
    await freePlacement(client, m.site_id, p, m.id);
    await client.query(
      `UPDATE site_media SET slot = $2, region_id = $3, focal = $4, alt = COALESCE(NULLIF($5, ''), alt) WHERE id = $1`,
      [m.id, p.slot, p.region_id, FOCAL[req.body.focal] || m.focal, String(req.body.alt || '').trim().slice(0, 300)]
    );
    await logAction(req.session.admin.id, 'media', m.id, 'edit_media', p, client);
  });
  media.invalidate();
  res.redirect(`/admin/medien?site=${m.site_id}&ok=Gespeichert`);
}));

// Löschen = auch Takedown auf Verlangen des Rechteinhabers
router.post('/:id/loeschen', wrap(async (req, res, next) => {
  const m = await db.one('DELETE FROM site_media WHERE id = $1 RETURNING *', [req.params.id]);
  if (!m) return next();
  media.removeFiles(m);
  media.invalidate();
  await logAction(req.session.admin.id, 'media', m.id, 'delete_media', { credit: m.credit, license: m.license, source_url: m.source_url });
  res.redirect(`/admin/medien?site=${m.site_id}&ok=Bild+entfernt`);
}));

module.exports = router;
