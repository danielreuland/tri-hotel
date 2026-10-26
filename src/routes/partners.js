// Weiterleitung zu Partnerlinks: /go/<objekt-slug>/<programm>[/bewertungen], gezählt je Tag, nicht indexiert.
const express = require('express');
const partners = require('../services/partners');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const BOT_RE = /bot|crawl|spider|preview|slurp|facebookexternalhit/i;

router.get('/go/:slug/:program/:kind?', wrap(async (req, res, next) => {
  const r = req.hostRanking;
  const kind = !req.params.kind ? 'booking' : req.params.kind === 'bewertungen' ? 'reviews' : null;
  if (!r || !kind || !/^[a-z0-9-]+$/.test(req.params.slug) || !/^[a-z0-9_-]+$/.test(req.params.program)) return next();
  const link = await partners.resolve(r.entity_type, req.params.slug, req.params.program, kind);
  if (!link) return next();
  if (!BOT_RE.test(req.get('user-agent') || '')) await partners.countClick(link);
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Cache-Control', 'no-store');
  res.redirect(302, partners.buildUrl(link, link.url));
}));

module.exports = router;
