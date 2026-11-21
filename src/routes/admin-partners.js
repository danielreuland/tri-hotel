// Admin: Partnerprogramme (Kennung bzw. Netzwerk-Vorlage, Status) und Klickübersicht.
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const db = require('../db');
const config = require('../config');
const partners = require('../services/partners');
const { logAction } = require('../lib/audit');
const { requireAdmin } = require('../middleware/context');

const router = express.Router();
router.use(requireAdmin);
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// „aid=123456“ je Zeile -> { aid: '123456' }
function parseParams(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_.-]{1,40})\s*=\s*(\S{1,200})\s*$/.exec(line);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

router.get('/', wrap(async (req, res) => {
  const days = [7, 30, 90, 365].includes(Number(req.query.tage)) ? Number(req.query.tage) : 30;
  res.render('admin/partners', {
    title: 'Partnerprogramme', programs: await partners.programs(), stats: await partners.stats(days), days,
    monetized: partners.monetized, flash: req.query.ok || null, error: req.query.fehler || null,
    open: String(req.query.offen || ''),
  });
}));

// ---------- Partner-Button-Test (Rangliste) ----------
// Schalter (aus / Test / immer an) und Auswertung je Variante. Neutralität: nur Anzeige, ändert weder Score noch Reihenfolge.
const pb = require('../lib/partner-button');
const listStats = require('../services/list-stats');
const rankingsSvc = require('../services/rankings');

router.get('/button-test', wrap(async (req, res) => {
  const all = await db.many(`SELECT id, slug, name FROM rankings WHERE status = 'active' ORDER BY is_default DESC, name`);
  const ranking = all.find((r) => r.slug === req.query.r) || (req.site && (await rankingsSvc.getDefaultRanking(req.site.id))) || all[0] || null;
  const range = listStats.period(req.query);
  const mode = await pb.mode();
  const progs = (await partners.programs({ activeOnly: true })).filter((p) => partners.monetized(p));
  res.render('admin/partner-button-test', {
    title: 'Partner-Button-Test', rankings: all, ranking, range, mode, MODES: pb.MODES,
    today: pb.berlinDay(), todayVariant: pb.variantFor('test'), programs: progs,
    report: ranking ? await listStats.report(ranking.id, range) : null,
    flash: req.query.ok || null,
  });
}));

router.post('/button-test', wrap(async (req, res) => {
  const m = String(req.body.mode || '');
  if (!pb.MODES[m]) return res.redirect('/admin/partner/button-test');
  const { before, after } = await pb.setMode(m, req.session.admin.id);
  await logAction(req.session.admin.id, 'setting', req.session.admin.id, 'set_partner_button', { old: before, new: after });
  res.redirect(`/admin/partner/button-test?ok=${encodeURIComponent(`Partner-Button: ${pb.MODES[after]}`)}`);
}));

// Ziel-Domains „expedia.de, hotels.com“ -> ['expedia.de', 'hotels.com']
const parseDomains = (text) => [...new Set(String(text || '').toLowerCase().split(/[\s,;]+/).map((d) => d.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)))].slice(0, 10);

// Suchseite mit {q}: https und Platzhalter
const validSearch = (url) => !url || (/^https:\/\//.test(url) && /\{q\}/.test(url));

// Neues Programm (z. B. weiterer Buchungsanbieter) – startet inaktiv
router.post('/neu', wrap(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  const code = String(req.body.code || name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 30);
  const domains = parseDomains(req.body.domains);
  if (!name || !code || !domains.length) return res.redirect(`/admin/partner?fehler=${encodeURIComponent('Name und mindestens eine Ziel-Domain angeben.')}`);
  try {
    const row = await db.one(
      `INSERT INTO partner_programs (code, name, domains, label_booking, label_reviews, status, sort_order)
       VALUES ($1, $2, $3, $4, $5, 'inactive', (SELECT COALESCE(max(sort_order), 0) + 10 FROM partner_programs)) RETURNING id`,
      [code, name, domains, `Preise bei ${name}`, `Bewertungen bei ${name}`]);
    await logAction(req.session.admin.id, 'partner_program', row.id, 'create_partner_program', { code, domains });
  } catch (err) {
    if (err.code !== '23505') throw err;
    return res.redirect(`/admin/partner?fehler=${encodeURIComponent('Ein Programm mit diesem Kürzel gibt es schon.')}`);
  }
  res.redirect(`/admin/partner?ok=${encodeURIComponent(`${name} angelegt – Kennung eintragen und aktivieren`)}&offen=${code}#p-${code}`);
}));

router.post('/:id', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const old = await db.one('SELECT * FROM partner_programs WHERE id = $1', [req.params.id]);
  if (!old) return next();
  const b = req.body;
  const template = String(b.link_template || '').trim() || null;
  if (template && (!/^https:\/\//.test(template) || !/\{url(_enc)?\}/.test(template))) {
    return res.redirect(`/admin/partner?fehler=${encodeURIComponent('Deeplink-Vorlage: https-Adresse mit {url} oder {url_enc}.')}&offen=${old.code}#p-${old.code}`);
  }
  const searchUrl = String(b.search_url || '').trim() || null;
  if (!validSearch(searchUrl)) return res.redirect(`/admin/partner?fehler=${encodeURIComponent('Such-Adresse: https mit Platzhalter {q}.')}&offen=${old.code}#p-${old.code}`);
  const domains = b.domains !== undefined ? parseDomains(b.domains) : old.domains;
  const upd = {
    name: String(b.name || old.name).trim().slice(0, 80),
    domains,
    search_url: searchUrl,
    auto_search: ['booking', 'reviews'].includes(b.auto_search) && searchUrl ? b.auto_search : null,
    sort_order: Math.max(0, Math.min(999, Number.parseInt(b.sort_order, 10) || 100)),
    direct_link: b.direct_link === 'on',
    trademark_notice: String(b.trademark_notice || '').trim().slice(0, 300) || null,
    id_url: /^https:\/\/\S+\{id\}/.test(String(b.id_url || '').trim()) ? String(b.id_url).trim().slice(0, 300) : null,
    id_from: /^[a-z0-9_-]{2,40}$/.test(String(b.id_from || '')) && b.id_from !== old.code ? b.id_from : null,
    id_params: String(b.id_params || '').split(/[\s,]+/).filter((x) => /^[\w.[\]-]{1,40}$/.test(x)).slice(0, 5),
    link_params: parseParams(b.link_params),
    link_template: template,
    label_booking: String(b.label_booking || old.label_booking).trim().slice(0, 80),
    label_reviews: String(b.label_reviews || old.label_reviews).trim().slice(0, 80),
    status: b.status === 'active' ? 'active' : 'inactive',
    notes: String(b.notes || '').trim().slice(0, 1000) || null,
    requires_attribute: /^[a-z_]{2,40}$/.test(String(b.requires_attribute || '')) ? b.requires_attribute : null,
  };
  await db.query(
    `UPDATE partner_programs SET name=$2, link_params=$3, link_template=$4, label_booking=$5, label_reviews=$6, status=$7, notes=$8,
       domains=$9, search_url=$10, auto_search=$11, sort_order=$12, direct_link=$13, trademark_notice=$14, id_url=$15, id_from=$16, id_params=$17, requires_attribute=$18, updated_at=now() WHERE id=$1`,
    [old.id, upd.name, JSON.stringify(upd.link_params), upd.link_template, upd.label_booking, upd.label_reviews, upd.status, upd.notes,
      upd.domains, upd.search_url, upd.auto_search, upd.sort_order, upd.direct_link, upd.trademark_notice, upd.id_url, upd.id_from, upd.id_params, upd.requires_attribute]);
  await logAction(req.session.admin.id, 'partner_program', old.id, 'edit_partner_program', {
    status: { old: old.status, new: upd.status }, params: Object.keys(upd.link_params), template: Boolean(upd.link_template),
    sort_order: upd.sort_order, auto_search: upd.auto_search, domains: upd.domains, requires_attribute: upd.requires_attribute,
  });
  res.redirect(`/admin/partner?ok=${encodeURIComponent(`${upd.name} gespeichert`)}&offen=${old.code}#p-${old.code}`);
}));

// Logo aus den Werbemitteln des Programms (SVG, PNG oder WebP, klein). Herkunft ist Pflicht – wie bei Bildern.
const LOGO_DIR = path.join(config.uploadDir, 'partner-logos');
const LOGO_TYPES = { 'image/svg+xml': 'svg', 'image/png': 'png', 'image/webp': 'webp' };
const logoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 300 * 1024 },
  fileFilter: (req, file, cb) => cb(null, Boolean(LOGO_TYPES[file.mimetype])) });
// SVG nur ohne aktive Inhalte (wird zusätzlich mit strenger CSP ausgeliefert)
const unsafeSvg = (text) => /<script|<foreignObject|\son\w+\s*=|javascript:|<iframe|<embed|<object|xlink:href\s*=\s*["']\s*(?!#)/i.test(text);

router.post('/:id/logo', logoUpload.single('logo'), wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const p = await db.one('SELECT * FROM partner_programs WHERE id = $1', [req.params.id]);
  if (!p) return next();
  const back = (msg, ok) => res.redirect(`/admin/partner?${ok ? 'ok' : 'fehler'}=${encodeURIComponent(msg)}&offen=${p.code}#p-${p.code}`);
  const removeOld = () => { if (p.logo_file) fs.rm(path.join(LOGO_DIR, path.basename(p.logo_file)), { force: true }, () => {}); };
  if (req.body.remove === 'on') {
    removeOld();
    await db.query('UPDATE partner_programs SET logo_file = NULL, logo_source = NULL, logo_updated_at = now() WHERE id = $1', [p.id]);
    await logAction(req.session.admin.id, 'partner_program', p.id, 'remove_partner_logo', { old: p.logo_file });
    return back(`Logo von ${p.name} entfernt`, true);
  }
  const source = String(req.body.logo_source || '').trim().slice(0, 300);
  if (!req.file) return back('Logo: SVG, PNG oder WebP bis 300 KB auswählen.');
  if (!source) return back('Logo: Herkunft angeben (z. B. „Awin-Werbemittel trivago, 28.10.2026“).');
  const ext = LOGO_TYPES[req.file.mimetype];
  if (ext === 'svg' && unsafeSvg(req.file.buffer.toString('utf8'))) return back('Logo: SVG enthält Skripte oder externe Verweise – bitte PNG oder ein bereinigtes SVG.');
  fs.mkdirSync(LOGO_DIR, { recursive: true });
  const file = `${p.code.replace(/[^a-z0-9-]/g, '')}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(LOGO_DIR, file), req.file.buffer);
  removeOld();
  await db.query('UPDATE partner_programs SET logo_file = $2, logo_source = $3, logo_updated_at = now() WHERE id = $1', [p.id, file, source]);
  await logAction(req.session.admin.id, 'partner_program', p.id, 'upload_partner_logo', { old: p.logo_file, new: file, source });
  back(`Logo von ${p.name} gespeichert`, true);
}));

module.exports = router;
module.exports.LOGO_DIR = LOGO_DIR;
module.exports.unsafeSvg = unsafeSvg;
