// robots.txt, sitemap.xml und Vorschaubilder (Open Graph) – je Site über den Host.
const express = require('express');
const db = require('../db');
const config = require('../config');
const rankings = require('../services/rankings');
const areas = require('../services/areas');
const og = require('../services/og');
const scoring = require('../services/scoring');
const seo = require('../lib/seo');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.get('/robots.txt', (req, res) => {
  const lines = config.noindex
    ? ['User-agent: *', 'Disallow: /']
    : ['User-agent: *', 'Disallow: /admin', 'Disallow: /anfrage/', 'Disallow: /bestaetigen/', '', `Sitemap: ${res.locals.siteUrl}/sitemap.xml`];
  res.type('text/plain').send(`${lines.join('\n')}\n`);
});

function xmlEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Pfade eines Rankings: Standard-Ranking der Site liegt auf "/", weitere unter /rankings/<slug>
function basePath(ranking) {
  return ranking.is_default ? '' : `/rankings/${ranking.slug}`;
}

function entityPath(ranking, slug) {
  return ranking.is_default ? `/${ranking.entity_type}/${slug}` : `/rankings/${ranking.slug}/${slug}`;
}

router.get('/sitemap.xml', wrap(async (req, res) => {
  const site = req.site;
  const base = res.locals.siteUrl;
  const urls = [];
  const all = await db.many(`SELECT * FROM rankings WHERE site_id = $1 AND status = 'active' ORDER BY is_default DESC, name`, [site.id]);
  for (const ranking of all) {
    const bp = basePath(ranking);
    urls.push({ loc: `${base}${bp || '/'}`, priority: '1.0' });
    urls.push({ loc: `${base}${ranking.is_default ? res.locals.scorePath : `${bp}/methodik`}`, priority: '0.5' });
    const live = await db.many(
      `SELECT e.slug, GREATEST(e.updated_at, er.updated_at) AS lastmod FROM entity_rankings er JOIN entities e ON e.id = er.entity_id
        WHERE er.ranking_id = $1 AND er.status = 'live' ORDER BY e.slug`,
      [ranking.id]
    );
    for (const e of live) urls.push({ loc: `${base}${entityPath(ranking, e.slug)}`, lastmod: e.lastmod, priority: '0.8' });
    // Regionen und Länder nur, wenn genug Einträge (keine dünnen Seiten)
    const ov = await areas.overview(ranking, site.id);
    for (const r of ov.regions.filter((x) => x.indexable)) urls.push({ loc: `${base}${bp}/region/${r.slug}`, priority: '0.9' });
    for (const c of ov.countries.filter((x) => x.indexable)) urls.push({ loc: `${base}${bp}/land/${c.slug}`, priority: '0.7' });
  }
  const body = urls.map((u) => `  <url><loc>${xmlEsc(u.loc)}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}<priority>${u.priority}</priority></url>`).join('\n');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`);
}));

async function sendPng(res, data) {
  const buf = await og.png(data);
  res.set('Cache-Control', 'public, max-age=86400').type('png').send(buf);
}

// Startseite
router.get('/og/start.png', wrap(async (req, res, next) => {
  const r = req.hostRanking;
  if (!r) return next();
  const content = r.content || {};
  await sendPng(res, { eyebrow: content.hero_eyebrow || r.score_name, title: content.hero_title || r.name, subtitle: `${r.name} · ${r.score_name} 0–100`, site: req.site });
}));

// Region oder Land des Host-Rankings
router.get('/og/:kind(region|land)/:slug.png', wrap(async (req, res, next) => {
  const r = req.hostRanking;
  if (!r) return next();
  let area = null;
  if (req.params.kind === 'region') {
    const reg = await areas.region(req.site.id, req.params.slug);
    area = reg && areas.regionArea(reg);
  } else {
    const code = seo.countryFromSlug(req.params.slug);
    area = code && areas.countryArea(code);
  }
  if (!area) return next();
  const d = await areas.pageData(r, area, null);
  await sendPng(res, {
    eyebrow: `${r.score_name} · Ranking`, title: `${r.name} ${area.nameIn}`,
    subtitle: d.count ? `${d.count} geprüfte ${r.entity_label_pl}` : `Jetzt ${r.entity_label_pl} vorschlagen`, site: req.site,
  });
}));

// Objektseite des Host-Rankings, z. B. /og/hotel/hotel-mar-azul.png
router.get('/og/:type/:slug.png', wrap(async (req, res, next) => {
  const r = req.hostRanking;
  if (!r || req.params.type !== r.entity_type) return next();
  const entity = await db.one(`SELECT * FROM entities WHERE entity_type = $1 AND slug = $2`, [r.entity_type, req.params.slug]);
  const er = entity && (await db.one(`SELECT * FROM entity_rankings WHERE entity_id = $1 AND ranking_id = $2 AND status = 'live'`, [entity.id, r.id]));
  if (!er) return next();
  const showScore = er.score !== null && Number(er.completeness) >= scoring.withDefaults(r.formula).min_completeness;
  await sendPng(res, {
    eyebrow: r.score_name, title: entity.name,
    subtitle: [entity.city, entity.country && seo.countryName(entity.country)].filter(Boolean).join(', '),
    score: showScore ? er.score : null, label: showScore ? scoring.labelFor(er.score, r.labels) : null, site: req.site,
  });
}));

module.exports = router;
