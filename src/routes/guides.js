// Ratgeber je Site unter /ratgeber/:slug (erste Seite: Trainingslager in der Ferienwohnung) und Klickzählung der
// Partnerlinks auf redaktionellen Seiten. Partnerlinks stehen direkt im href; hier gibt es bewusst keine GET-Weiterleitung.
const fs = require('fs');
const path = require('path');
const express = require('express');
const db = require('../db');
const guides = require('../services/guides');
const partners = require('../services/partners');
const seo = require('../lib/seo');
const richtext = require('../lib/richtext');
const describer = require('../services/describer');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const VIEWS = path.join(__dirname, '..', 'views', 'public', 'guides');
const CONTENT = path.join(__dirname, '..', 'content', 'guides');

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
// Datum aus der DB (date → Date um Mitternacht lokal); als TT.MM.JJJJ bzw. „November 2026“
const dayLabel = (d) => (d ? new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null);
const monthLabel = (d) => (d ? `${MONTHS[new Date(d).getMonth()]} ${new Date(d).getFullYear()}` : null);
const localIso = (d) => {
  if (!d) return null;
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

function content(view) {
  const file = path.join(CONTENT, `${view}.js`);
  return fs.existsSync(file) ? require(file) : {};
}

// Interne Ziele, die es auf der Site gibt: aktive Regionen (Pfad je Slug) und live Objektseiten (nur angefragte Slugs)
async function internalTargets(site, ranking, entitySlugs) {
  const regions = await db.many(`SELECT slug, name, name_in FROM regions WHERE site_id = $1 AND status = 'active'`, [site.id]);
  const live = entitySlugs.length && ranking ? await db.many(
    `SELECT e.slug, e.name FROM entities e JOIN entity_rankings er ON er.entity_id = e.id AND er.ranking_id = $1 AND er.status = 'live'
      WHERE e.entity_type = $2 AND e.slug = ANY($3::text[])`, [ranking.id, ranking.entity_type, entitySlugs]) : [];
  return {
    region: (slug) => { const r = regions.find((x) => x.slug === slug); return r ? { href: `/region/${r.slug}`, name: r.name, nameIn: r.name_in } : null; },
    entity: (slug) => { const e = live.find((x) => x.slug === slug); return e ? { href: `/${ranking.entity_type}/${e.slug}`, name: e.name } : null; },
  };
}

async function render(req, res, guide) {
  const site = req.site;
  const ranking = req.hostRanking;
  const siteUrl = res.locals.siteUrl;
  const pagePath = `/ratgeber/${guide.slug}`;
  const cards = await guides.cards(guide.id);
  const links = await guides.links(site.id, 'ratgeber');
  // Karten bekommen ihren Link nur, wenn das Bad verifiziert ist – das ist die Bedingung für eine aktive Karte
  for (const c of cards) {
    c.blocks = describer.parseBody(c.body);
    c.link = c.link_slot ? links[c.link_slot] || null : null;
  }
  const targets = await internalTargets(site, ranking, [...new Set(cards.flatMap((c) => c.entity_slugs || []))]);
  const rentals = ranking ? await guides.rentalList(ranking, { criteria: guide.list_criteria || [] }) : [];
  const { faq = [] } = content(guide.view);
  const used = (keys) => keys.filter((k) => links[k]);
  // Werbehinweis (Box unter der H1, Fußzeile) nur, wenn auf der Seite wirklich Partnerlinks stehen
  const adKeys = [...new Set([...used(['allgemein', 'gruppen', 'waschmaschine', 'mallorca-preise', 'vereinsgruppen']), ...cards.filter((c) => c.link).map((c) => c.link.key)])];
  const adPrograms = [...new Set(adKeys.map((k) => links[k].program))];
  const trademarks = [...new Set(adKeys.map((k) => links[k].trademark).filter(Boolean))];
  const crumbs = [{ name: site.name, url: `${siteUrl}/` }, { name: guide.h1, url: `${siteUrl}${pagePath}` }];
  const article = {
    '@context': 'https://schema.org', '@type': 'Article', headline: guide.h1, description: guide.description,
    datePublished: localIso(guide.published_on || guide.updated_on), dateModified: localIso(guide.updated_on),
    inLanguage: 'de-DE', mainEntityOfPage: `${siteUrl}${pagePath}`,
    author: { '@type': 'Organization', name: site.name, url: `${siteUrl}/` },
    publisher: { '@type': 'Organization', name: site.name, url: `${siteUrl}/` },
  };
  res.render(`public/guides/${guide.view}`, {
    title: guide.title, description: guide.description, canonical: `${siteUrl}${pagePath}`, ogType: 'article',
    jsonLd: [article, seo.breadcrumbLd(crumbs), ...(faq.length ? [seo.faqLd(faq.map((f) => ({ q: f.q, a: richtext.plain(f.a) })))] : [])],
    guide, cards, links, rentals, faq, ranking, targets, adPrograms, trademarks, hasAds: adKeys.length > 0,
    updatedLabel: monthLabel(guide.updated_on), updatedIso: localIso(guide.updated_on), researchLabel: dayLabel(guide.research_on),
    dayLabel, countryName: seo.countryName, rich: (t) => richtext.toHtml(t, { siteHost: site.primary_domain }),
    entityPath: (e) => `/${ranking.entity_type}/${e.slug}`,
  });
}

router.get('/ratgeber/:slug', wrap(async (req, res, next) => {
  if (!req.site) return next();
  const guide = await guides.bySlug(req.site.id, req.params.slug);
  if (!guide || !fs.existsSync(path.join(VIEWS, `${guide.view}.ejs`))) return next();
  await render(req, res, guide);
}));

// Klick auf einen Partnerlink im Ratgeber oder Hinweiskasten (Beacon aus public/js/site.js). Nur Anzahl je Slot, Tag, Herkunft.
router.post('/go/ratgeber/:program/:slot/klick', wrap(async (req, res) => {
  const slot = req.site && (await guides.slotForClick(req.site.id, req.params.program, req.params.slot));
  if (slot && partners.countable(req, `ratgeber/${req.params.program}/${req.params.slot}`)) {
    await guides.countClick(slot.id, partners.clickSource({ referer: req.get('referer') }));
  }
  res.set('Cache-Control', 'no-store');
  res.status(204).end();
}));

module.exports = router;
