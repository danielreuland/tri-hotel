// Admin: Partnerprogramme (Kennung bzw. Netzwerk-Vorlage, Status) und Klickübersicht.
const express = require('express');
const db = require('../db');
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
  });
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
  res.redirect(`/admin/partner?ok=${encodeURIComponent(`${name} angelegt – Kennung eintragen und aktivieren`)}#p-${code}`);
}));

router.post('/:id', wrap(async (req, res, next) => {
  if (!UUID_RE.test(req.params.id)) return next();
  const old = await db.one('SELECT * FROM partner_programs WHERE id = $1', [req.params.id]);
  if (!old) return next();
  const b = req.body;
  const template = String(b.link_template || '').trim() || null;
  if (template && (!/^https:\/\//.test(template) || !/\{url(_enc)?\}/.test(template))) {
    return res.redirect(`/admin/partner?fehler=${encodeURIComponent('Deeplink-Vorlage: https-Adresse mit {url} oder {url_enc}.')}`);
  }
  const searchUrl = String(b.search_url || '').trim() || null;
  if (!validSearch(searchUrl)) return res.redirect(`/admin/partner?fehler=${encodeURIComponent('Such-Adresse: https mit Platzhalter {q}.')}`);
  const domains = b.domains !== undefined ? parseDomains(b.domains) : old.domains;
  const upd = {
    name: String(b.name || old.name).trim().slice(0, 80),
    domains,
    search_url: searchUrl,
    auto_search: ['booking', 'reviews'].includes(b.auto_search) && searchUrl ? b.auto_search : null,
    sort_order: Math.max(0, Math.min(999, Number.parseInt(b.sort_order, 10) || 100)),
    link_params: parseParams(b.link_params),
    link_template: template,
    label_booking: String(b.label_booking || old.label_booking).trim().slice(0, 80),
    label_reviews: String(b.label_reviews || old.label_reviews).trim().slice(0, 80),
    status: b.status === 'active' ? 'active' : 'inactive',
    notes: String(b.notes || '').trim().slice(0, 1000) || null,
  };
  await db.query(
    `UPDATE partner_programs SET name=$2, link_params=$3, link_template=$4, label_booking=$5, label_reviews=$6, status=$7, notes=$8,
       domains=$9, search_url=$10, auto_search=$11, sort_order=$12, updated_at=now() WHERE id=$1`,
    [old.id, upd.name, JSON.stringify(upd.link_params), upd.link_template, upd.label_booking, upd.label_reviews, upd.status, upd.notes,
      upd.domains, upd.search_url, upd.auto_search, upd.sort_order]);
  await logAction(req.session.admin.id, 'partner_program', old.id, 'edit_partner_program', {
    status: { old: old.status, new: upd.status }, params: Object.keys(upd.link_params), template: Boolean(upd.link_template),
    sort_order: upd.sort_order, auto_search: upd.auto_search, domains: upd.domains,
  });
  res.redirect(`/admin/partner?ok=${encodeURIComponent(`${upd.name} gespeichert`)}`);
}));

module.exports = router;
