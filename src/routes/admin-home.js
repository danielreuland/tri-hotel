// Startseite verwalten: Reihenfolge und Sichtbarkeit der Bereiche, Hervorhebung je Bereich (automatisch oder Redaktion).
const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/context');
const { logAction } = require('../lib/audit');
const home = require('../services/home');
const sites = require('../services/sites');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.use(requireAdmin);

async function siteOf(req) {
  const id = req.query.site || req.body.site;
  if (id && UUID_RE.test(id)) return db.one('SELECT * FROM sites WHERE id = $1', [id]);
  return db.one('SELECT * FROM sites WHERE is_default LIMIT 1');
}

// Auswahllisten für die Redaktion: Live-Objekte des Standard-Rankings, aktive Camps und Regionen der Site
async function options(site) {
  const [entities, camps, regions] = await Promise.all([
    db.many(
      `SELECT e.slug, e.name, er.score FROM entity_rankings er JOIN entities e ON e.id = er.entity_id JOIN rankings r ON r.id = er.ranking_id
        WHERE r.site_id = $1 AND r.is_default AND er.status = 'live' ORDER BY e.name`, [site.id]),
    db.many(`SELECT slug, name FROM camp_providers WHERE site_id = $1 AND status = 'active' ORDER BY lower(name)`, [site.id]),
    db.many(`SELECT slug, name FROM regions WHERE site_id = $1 AND status = 'active' ORDER BY sort_order, name`, [site.id]),
  ]);
  return { entities, camps, regions };
}

router.get('/', wrap(async (req, res, next) => {
  const site = await siteOf(req);
  if (!site) return next();
  const allSites = await db.many('SELECT id, name FROM sites ORDER BY is_default DESC, name');
  res.render('admin/home', {
    title: 'Startseite', site, allSites, blocks: home.normalizeConfig(site.home), BLOCKS: home.BLOCKS,
    opts: await options(site), flash: req.query.ok || null,
  });
}));

router.post('/', wrap(async (req, res, next) => {
  const site = await siteOf(req);
  if (!site) return next();
  const b = req.body;
  const rows = home.DEFAULT_ORDER.map((key) => ({
    key,
    pos: Number(b[`pos_${key}`]) || 99,
    hidden: b[`show_${key}`] !== '1',
    pick: { mode: b[`mode_${key}`] === 'editorial' ? 'editorial' : 'auto', slug: String(b[`slug_${key}`] || '').trim(), until: String(b[`until_${key}`] || '').trim() },
  }));
  rows.sort((x, y) => x.pos - y.pos || home.DEFAULT_ORDER.indexOf(x.key) - home.DEFAULT_ORDER.indexOf(y.key));
  const saved = await home.saveConfig(site.id, rows);
  await logAction(req.session.admin.id, 'site', site.id, 'edit_home', { blocks: saved });
  sites.clearCache();
  res.redirect(`/admin/startseite?site=${site.id}&ok=Gespeichert`);
}));

module.exports = router;
