// Trainingscamps: Ratgeber-Seite (inhaltlich je Site unter views/sites/<code>/trainingscamp.ejs),
// neutrale Anbieterliste mit Filtern, Anbieterprofile, gezählte Weiterleitung und Formular „Für Camp-Anbieter“.
const express = require('express');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const camps = require('../services/camps');
const leads = require('../services/leads');
const seo = require('../lib/seo');
const { ipHash, isEmail } = require('../lib/util');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const SITES_DIR = path.join(__dirname, '..', 'views', 'sites');
const limiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false });

// Ratgeber-Inhalt der Site (Vorlage + Metadaten); ohne Vorlage gibt es die Seite für diese Site nicht
function guideFor(site) {
  if (!site || !/^[a-z0-9-]+$/.test(site.code)) return null;
  const tpl = path.join(SITES_DIR, site.code, 'trainingscamp.ejs');
  if (!fs.existsSync(tpl)) return null;
  const metaFile = path.join(SITES_DIR, site.code, 'trainingscamp.json');
  const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
  return { view: `sites/${site.code}/trainingscamp`, meta };
}

function faqLd(faq) {
  return {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
}

router.get('/trainingscamp', wrap(async (req, res, next) => {
  const guide = guideFor(req.site);
  if (!guide) return next();
  const filters = camps.parseFilters(req.query);
  const [providers, regions] = await Promise.all([camps.list(req.site.id, filters), camps.regions(req.site.id)]);
  const siteUrl = res.locals.siteUrl;
  const m = guide.meta;
  res.render(guide.view, {
    title: m.title || 'Trainingscamp', description: m.description || '', canonical: `${siteUrl}/trainingscamp`,
    noindex: filters.active, // gefilterte Ansichten nicht indexieren
    jsonLd: [
      seo.breadcrumbLd([{ name: req.site.name, url: `${siteUrl}/` }, { name: m.breadcrumb || 'Trainingscamp', url: `${siteUrl}/trainingscamp` }]),
      ...(m.faq && m.faq.length ? [faqLd(m.faq)] : []),
    ],
    faq: m.faq || [], providers, regions, filters, MODELS: camps.MODELS, FLAGS: camps.FLAGS, flag: camps.flag,
  });
}));

async function renderProvider(req, res, p, extra = {}) {
  const hotels = await camps.hotelsOf(p.id, req.hostRanking ? req.hostRanking.id : null);
  const siteUrl = res.locals.siteUrl;
  const canonical = `${siteUrl}/trainingscamp/anbieter/${p.slug}`;
  // Anfrageformular nur bei Anbietern mit Vereinbarung; Hotel aus ?hotel=<entity-id> vorauswählen
  const pre = /^[0-9a-f-]{36}$/.test(req.query.hotel || '') ? req.query.hotel : '';
  res.status(extra.leadErrors && extra.leadErrors.length ? 422 : 200).render('public/camp-provider', {
    leadForm: p.lead_active ? { months: leads.months(), LEVELS: leads.LEVELS, consent: leads.consentText(p), form: { entity_id: pre }, errors: [], ...(extra.lead || {}) } : null,
    leadErrors: extra.leadErrors || [],
    title: `${p.name}: Camps, Preise und Hotels`,
    description: `${p.name}${p.destinations.length ? ` – Camps in ${p.destinations.slice(0, 4).join(', ')}` : ''}: Leistungen, Preisbeispiele und Hotels im Überblick. Neutral, ohne bezahlte Platzierung.`,
    canonical,
    jsonLd: [seo.breadcrumbLd([
      { name: req.site.name, url: `${siteUrl}/` }, { name: 'Trainingscamp', url: `${siteUrl}/trainingscamp` }, { name: p.name, url: canonical },
    ])],
    p, hotels, MODELS: camps.MODELS, FLAGS: camps.FLAGS, HOTEL_VALUES: camps.HOTEL_VALUES, FLIGHT_VALUES: camps.FLIGHT_VALUES, flag: camps.flag,
  });
}

router.get('/trainingscamp/anbieter/:slug', wrap(async (req, res, next) => {
  if (!guideFor(req.site)) return next();
  const p = await camps.bySlug(req.site.id, req.params.slug);
  if (!p) return next();
  await renderProvider(req, res, p);
}));

// ---------- Anfrage an einen Camp-Anbieter (Baustein B) ----------

const leadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false });

router.post('/trainingscamp/anbieter/:slug/anfrage', leadLimiter, wrap(async (req, res, next) => {
  if (!guideFor(req.site)) return next();
  const p = await camps.bySlug(req.site.id, req.params.slug);
  if (!p || !p.lead_active) return next();
  const done = `/trainingscamp/anbieter/${p.slug}/anfrage/danke`;
  if (req.body.company_url) return res.redirect(303, done); // Honeypot
  const hotels = await camps.hotelsOf(p.id, req.hostRanking ? req.hostRanking.id : null);
  const { errors, data } = leads.validate(req.body, p, hotels);
  if (!errors.length && (await leads.recentCountByIp(req.ip)) >= 5) errors.push('Zu viele Anfragen in kurzer Zeit. Bitte versuch es morgen noch einmal.');
  if (errors.length) return renderProvider(req, res, p, { leadErrors: errors, lead: { form: req.body } });
  if (!(await leads.isDuplicate(p.id, data.email))) await leads.create({ provider: p, site: req.site, data, ip: req.ip });
  res.redirect(303, done);
}));

router.get('/trainingscamp/anbieter/:slug/anfrage/danke', wrap(async (req, res, next) => {
  const p = req.site && (await camps.bySlug(req.site.id, req.params.slug));
  if (!p) return next();
  res.render('public/lead-done', { title: 'Anfrage gesendet', noindex: true, provider: p, status: 'sent' });
}));

router.get('/anfrage-bestaetigen/:token', wrap(async (req, res) => {
  const r = await leads.verify(req.params.token);
  const provider = r.lead ? await db.one('SELECT name, slug FROM camp_providers WHERE id = $1', [r.lead.provider_id]) : null;
  res.render('public/lead-done', { title: 'Anfrage bestätigt', noindex: true, provider, status: r.status });
}));

// Gezählte Weiterleitung zum Anbieter (nur Anzahl je Tag, keine personenbezogenen Daten)
router.get('/go/camp/:slug', wrap(async (req, res, next) => {
  const p = req.site && (await camps.bySlug(req.site.id, req.params.slug));
  if (!p) return next();
  // Bots und Vorschau-Abrufe nicht zählen
  if (!/bot|crawl|spider|preview|slurp|facebookexternalhit/i.test(req.get('user-agent') || '')) await camps.countClick(p.id);
  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.redirect(302, camps.outboundUrl(p, req.site.primary_domain));
}));

// ---------- Für Camp-Anbieter ----------

const REQUESTS = { korrektur: 'Angaben korrigieren', aufnahme: 'Aufnahme in die Übersicht', partner: 'Partnerschaft / Anfragen erhalten', sonstiges: 'Sonstiges' };

async function renderProviderForm(req, res, extra = {}) {
  const providers = await db.many(`SELECT id, name FROM camp_providers WHERE site_id = $1 AND status <> 'archived' ORDER BY lower(name)`, [req.site.id]);
  res.render('public/camp-partners', {
    title: 'Für Camp-Anbieter', description: 'Angaben korrigieren, Aufnahme beantragen oder Anfragen von Interessenten erhalten.',
    canonical: `${res.locals.siteUrl}/trainingscamp/fuer-anbieter`, providers, REQUESTS, errors: [], form: {}, sent: false, ...extra,
  });
}

router.get('/trainingscamp/fuer-anbieter', wrap(async (req, res, next) => {
  if (!guideFor(req.site)) return next();
  await renderProviderForm(req, res, { form: { provider_id: req.query.anbieter || '' } });
}));

router.post('/trainingscamp/fuer-anbieter', limiter, wrap(async (req, res, next) => {
  if (!guideFor(req.site)) return next();
  const b = req.body;
  if (b.company_url) return renderProviderForm(req, res, { sent: true });
  const form = {
    company: String(b.company || '').trim().slice(0, 160), name: String(b.name || '').trim().slice(0, 120),
    email: String(b.email || '').trim().slice(0, 200), request: REQUESTS[b.request] ? b.request : 'sonstiges',
    provider_id: /^[0-9a-f-]{36}$/.test(b.provider_id || '') ? b.provider_id : '', message: String(b.message || '').trim().slice(0, 5000),
  };
  const errors = [];
  if (!form.company) errors.push('Bitte den Namen des Unternehmens bzw. Camps angeben.');
  if (!isEmail(form.email)) errors.push('Bitte eine gültige E-Mail-Adresse angeben.');
  if (form.message.length < 10) errors.push('Bitte beschreib kurz dein Anliegen.');
  if (b.privacy !== 'on') errors.push('Bitte den Hinweis zum Datenschutz bestätigen.');
  if (errors.length) return renderProviderForm(req, res, { errors, form });
  await db.query(
    `INSERT INTO contact_messages (site_id, topic, company, name, email, provider_id, request, message, ip_hash)
     VALUES ($1, 'anbieter', $2, $3, $4, $5, $6, $7, $8)`,
    [req.site.id, form.company, form.name || null, form.email, form.provider_id || null, form.request, form.message, ipHash(req.ip)]
  );
  await renderProviderForm(req, res, { sent: true });
}));

module.exports = router;
