// Fotoseite mit Tripadvisor-Fotos (B-87): eigene Unterseite je Objekt ohne Buchungs- oder Partnerlinks, noindex, nicht in
// der Sitemap. Die Seite selbst ruft nichts bei Tripadvisor ab – erst der Klick des Besuchers (POST …/fotos/laden) holt
// die Bildadressen über den Budget-Wächter; die Bilder lädt der Browser direkt von Tripadvisor. Nichts davon wird gespeichert.
const fs = require('fs');
const path = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const rankings = require('../services/rankings');
const partners = require('../services/partners');
const ta = require('../services/tripadvisor');
const { ipHash } = require('../lib/util');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
// Grobe Bremse je Adresse zusätzlich zur Sperre je Besucher und Objekt
const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { available: false, reason: 'rate' } });
// Logo nach den Markenvorgaben von Tripadvisor: Datei legt Daniel ab (public/img/tripadvisor-logo.svg), sonst Schriftzug
const LOGO_FILE = path.join(__dirname, '..', '..', 'public', 'img', 'tripadvisor-logo.svg');

// Objekt der Adresse, nur wenn Tripadvisor-Fotos dafür aktiv sind (sonst 404 – auch bei Not-Aus)
async function target(req) {
  let ranking;
  let slug;
  if (req.params.rslug) {
    ranking = req.site && (await rankings.getRankingBySlug(req.params.rslug, req.site.id));
    slug = req.params.eslug;
  } else {
    ranking = req.hostRanking;
    slug = req.params.slug;
    if (!ranking || req.params.type !== ranking.entity_type) return null;
  }
  if (!ranking || !/^[a-z0-9-]+$/.test(slug)) return null;
  if (!ta.cfg.enabled) return null;
  const entity = await db.one(
    `SELECT e.*, ${ta.OWN_IMAGES_SQL} AS own_images FROM entities e
      WHERE e.entity_type = $1 AND e.slug = $2
        AND EXISTS (SELECT 1 FROM entity_rankings er WHERE er.entity_id = e.id AND er.ranking_id = $3 AND er.status = 'live')`,
    [ranking.entity_type, slug, ranking.id]);
  if (!entity || ta.photoStatus(entity, { ownImages: entity.own_images }) !== 'active') return null;
  const base = ranking.is_default ? `/${ranking.entity_type}/${entity.slug}` : `/rankings/${ranking.slug}/${entity.slug}`;
  return { ranking, entity, base };
}

// Bilder von Tripadvisor nur auf dieser Seite erlauben (CSP sonst unverändert)
function allowImages(res) {
  const csp = res.getHeader('Content-Security-Policy');
  if (typeof csp !== 'string') return;
  const hosts = ta.cfg.imageHosts.map((h) => `https://*.${h}`).join(' ');
  res.setHeader('Content-Security-Policy', csp.replace(/img-src ([^;]*)/, (m, v) => `img-src ${v} ${hosts}`));
}

router.get(['/:type/:slug/fotos', '/rankings/:rslug/:eslug/fotos'], wrap(async (req, res, next) => {
  const t = await target(req);
  if (!t) return next();
  allowImages(res);
  res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
  res.render('public/ta-photos', {
    title: `Fotos: ${t.entity.name}`, noindex: true, canonical: null,
    entity: t.entity, ranking: t.ranking, backPath: t.base, loadUrl: `${t.base}/fotos/laden`,
    taLinks: ta.links(t.entity.ta_location_id), photoCount: ta.cfg.photoCount,
    taLogo: fs.existsSync(LOGO_FILE) ? '/static/img/tripadvisor-logo.svg' : null,
    countryName: require('../lib/seo').countryName,
    scripts: ['/static/js/ta-photos.js'],
  });
}));

// Klick „Fotos laden“: Antwort { available, photos: [{ url, width, height, caption, username, source, published }] }.
// Kein Abruf für Bots, ohne Herkunft von unserer Seite, bei wiederholtem Klick im Sperrzeitraum oder bei erreichtem Budget.
router.post(['/:type/:slug/fotos/laden', '/rankings/:rslug/:eslug/fotos/laden'], limiter, wrap(async (req, res) => {
  res.set({ 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
  const none = (reason) => res.json({ available: false, reason });
  const t = await target(req);
  if (!t) return res.status(404).json({ available: false, reason: 'off' });
  // Browser senden bei POST immer die Herkunft mit; Programme, die nur Adressen abrufen, nicht
  let fromUs = false;
  try { fromUs = new URL(req.get('origin') || '').host === req.get('host'); } catch { /* fehlt oder ungültig */ }
  const human = partners.isCountableClick({ userAgent: req.get('user-agent') || '', method: 'POST' });
  if (!fromUs || !human) return none('bot');
  try {
    if (!(await ta.acquireViewLock(ipHash(req.ip), t.entity.id))) return none('recent');
    const r = await ta.photos(t.entity);
    return res.json(r.available ? { available: true, photos: r.photos } : { available: false, reason: r.reason });
  } catch (err) {
    // im Zweifel Platzhalter statt Abruf
    console.error('[ta-photos]', err.message);
    return none('error');
  }
}));

module.exports = router;
